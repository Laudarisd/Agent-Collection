import { NextResponse } from "next/server";
import { crawlCompetitor } from "@/server/crawler/service";
import { query } from "@/server/db/pool";
import { apiError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DueRow = { id: string; name: string };

export async function GET(request: Request) { return runMonitor(request); }
export async function POST(request: Request) { return runMonitor(request); }

async function runMonitor(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  const supplied = request.headers.get("authorization") || "";
  if (supplied !== `Bearer ${configuredSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const intervalHours = clampNumber(process.env.MONITOR_INTERVAL_HOURS, 6, 1, 168);
    const batchSize = clampNumber(process.env.MONITOR_BATCH_SIZE, 1, 1, 5);
    const due = await query<DueRow>(`
      SELECT c.id, c.name
      FROM competitors c
      LEFT JOIN LATERAL (
        SELECT started_at FROM crawl_runs WHERE competitor_id=c.id ORDER BY started_at DESC LIMIT 1
      ) last_run ON TRUE
      WHERE last_run.started_at IS NULL OR last_run.started_at <= NOW() - ($1::int * INTERVAL '1 hour')
      ORDER BY COALESCE(last_run.started_at, TIMESTAMPTZ '1970-01-01') ASC, c.created_at ASC
      LIMIT $2
    `, [intervalHours, batchSize]);

    const results: Array<{ competitorId: string; competitorName: string; status: string; eventsCreated?: number; error?: string }> = [];
    for (const competitor of due.rows) {
      try {
        const result = await crawlCompetitor(competitor.id);
        results.push({ competitorId: competitor.id, competitorName: competitor.name, status: result.status, eventsCreated: result.eventsCreated });
      } catch (error) {
        results.push({ competitorId: competitor.id, competitorName: competitor.name, status: "failed", error: error instanceof Error ? error.message : "Crawl failed." });
      }
    }

    return NextResponse.json({ checked: due.rows.length, intervalHours, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Scheduled monitoring failed.");
  }
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}
