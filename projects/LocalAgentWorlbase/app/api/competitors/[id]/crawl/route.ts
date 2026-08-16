import { NextResponse } from "next/server";
import { crawlCompetitor } from "@/server/crawler/service";
import { apiError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    const result = await crawlCompetitor(id);
    return NextResponse.json({ result });
  } catch (error) {
    return apiError(error, "Competitor crawl failed.");
  }
}
