import "server-only";

import { randomUUID } from "node:crypto";
import { query } from "@/server/db/pool";
import { getCompetitor } from "@/server/db/repositories";
import type { ChangeImportance, CrawlResult } from "@/lib/intelligence/types";
import { discoverSitemapUrls, isCrawlablePage } from "@/server/crawler/discovery";
import { safeFetchText } from "@/server/crawler/fetch";
import { canonicalUrl, firstChangedExcerpt, parseHtmlPage, textChangeRatio, type ParsedPage } from "@/server/crawler/parser";
import { loadRobotsPolicy } from "@/server/crawler/robots";
import { assertPublicHttpUrl, sameOrigin } from "@/server/crawler/security";

const MAX_PAGES = Math.max(1, Math.min(Number(process.env.CRAWLER_MAX_PAGES || 30), 100));
const BASE_DELAY_MS = Math.max(0, Math.min(Number(process.env.CRAWLER_DELAY_MS || 200), 10_000));

type SnapshotRow = {
  title: string;
  meta_description: string;
  headings: string[];
  clean_text: string;
  content_hash: string;
  ctas: string[];
  pricing: string[];
  page_language: string;
};

type PageRow = { id: string; active: boolean };

export async function crawlCompetitor(competitorId: string): Promise<CrawlResult> {
  const competitor = await getCompetitor(competitorId);
  if (!competitor) throw new Error("Competitor was not found.");
  const root = await assertPublicHttpUrl(competitor.website);
  root.hash = "";
  const origin = root.origin;
  const runId = randomUUID();
  const errors: string[] = [];
  let pagesCrawled = 0;
  let pagesChanged = 0;
  let eventsCreated = 0;

  // Recover from an abandoned run after a process crash, then rely on the partial
  // unique index to reject genuinely concurrent crawls for this competitor.
  await query(`
    UPDATE crawl_runs SET status='failed', completed_at=NOW(),
      errors=jsonb_build_array('Previous crawl was abandoned before completion.')
    WHERE competitor_id=$1 AND status='running' AND started_at < NOW() - INTERVAL '1 hour'
  `, [competitorId]);
  await query(`INSERT INTO crawl_runs (id, competitor_id) VALUES ($1,$2)`, [runId, competitorId]);

  try {
    const baselineResult = await query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM page_snapshots s
      JOIN web_pages p ON p.id=s.web_page_id
      WHERE p.competitor_id=$1
    `, [competitorId]);
    const hasBaseline = Number(baselineResult.rows[0]?.count || 0) > 0;

    const robots = await loadRobotsPolicy(origin);
    const sitemapCandidates = robots.sitemaps.length ? robots.sitemaps : [new URL("/sitemap.xml", origin).toString()];
    const sitemap = await discoverSitemapUrls(sitemapCandidates, origin, 1000);
    const useSitemap = sitemap.urls.length > 0;
    const queue = useSitemap ? [...sitemap.urls] : [canonicalUrl(root)];
    const queued = new Set(queue);
    const visited = new Set<string>();
    const delayMs = Math.max(BASE_DELAY_MS, robots.crawlDelayMs);
    const sitemapExhaustiveForRemoval = useSitemap && sitemap.complete && sitemap.urls.length <= MAX_PAGES;

    while (queue.length && pagesCrawled < MAX_PAGES) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      if (!sameOrigin(url, origin) || !robots.allows(url)) continue;

      try {
        const response = await safeFetchText(url, { maxBytes: 2_500_000, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" });
        if (!sameOrigin(response.url, origin)) {
          errors.push(`${url}: redirected outside the competitor domain.`);
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          const unavailableEvent = await recordUnavailablePage({ competitorId, brandId: competitor.brandId, runId, url, status: response.status, hasBaseline });
          if (unavailableEvent) { eventsCreated += 1; pagesChanged += 1; }
          errors.push(`${url}: HTTP ${response.status}`);
          continue;
        }
        if (!/text\/html|application\/xhtml\+xml/i.test(response.contentType)) continue;

        const finalUrl = canonicalUrl(new URL(response.url));
        const parsed = parseHtmlPage(response.text, finalUrl);
        const outcome = await storeSnapshotAndChanges({
          brandId: competitor.brandId,
          competitorId,
          runId,
          url: finalUrl,
          status: response.status,
          html: response.text,
          parsed,
          hasBaseline,
        });
        pagesCrawled += 1;
        if (outcome.changed) pagesChanged += 1;
        eventsCreated += outcome.events;

        if (!useSitemap) {
          for (const link of parsed.links) {
            if (queue.length + visited.size >= MAX_PAGES * 4) break;
            try {
              const candidate = new URL(link);
              if (!isCrawlablePage(candidate) || !robots.allows(link) || queued.has(link)) continue;
              queued.add(link);
              queue.push(link);
            } catch { /* Ignore malformed discovered links. */ }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown crawl error";
        errors.push(`${url}: ${message}`.slice(0, 700));
      }

      if (delayMs > 0 && queue.length) await sleep(delayMs);
    }

    if (hasBaseline && sitemapExhaustiveForRemoval) {
      const removed = await markRemovedPages(competitor.brandId, competitorId, runId);
      eventsCreated += removed;
      pagesChanged += removed;
    }

    const pagesDiscovered = useSitemap ? sitemap.urls.length : queued.size;
    const partial = errors.length > 0 || queue.length > 0 || (useSitemap && !sitemap.complete);
    const status = partial ? "partial" : "completed";
    await query(`
      UPDATE crawl_runs SET completed_at=NOW(), status=$2, pages_discovered=$3,
        pages_crawled=$4, pages_changed=$5, events_created=$6, errors=$7::jsonb
      WHERE id=$1
    `, [runId, status, pagesDiscovered, pagesCrawled, pagesChanged, eventsCreated, JSON.stringify(errors.slice(0, 100))]);

    return { runId, competitorId, status, pagesDiscovered, pagesCrawled, pagesChanged, eventsCreated, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawler failed.";
    await query(`UPDATE crawl_runs SET completed_at=NOW(), status='failed', errors=$2::jsonb WHERE id=$1`, [runId, JSON.stringify([message])]).catch(() => undefined);
    throw error;
  }
}

async function storeSnapshotAndChanges(args: {
  brandId: string;
  competitorId: string;
  runId: string;
  url: string;
  status: number;
  html: string;
  parsed: ParsedPage;
  hasBaseline: boolean;
}): Promise<{ changed: boolean; events: number }> {
  const existing = await query<PageRow>(`SELECT id, active FROM web_pages WHERE competitor_id=$1 AND url=$2`, [args.competitorId, args.url]);
  const priorPage = existing.rows[0];
  const pageId = priorPage?.id ?? randomUUID();

  if (priorPage) {
    await query(`UPDATE web_pages SET last_seen_at=NOW(), last_seen_run_id=$2, active=TRUE WHERE id=$1`, [pageId, args.runId]);
  } else {
    await query(`INSERT INTO web_pages (id, competitor_id, url, last_seen_run_id) VALUES ($1,$2,$3,$4)`, [pageId, args.competitorId, args.url, args.runId]);
  }

  const previousResult = await query<SnapshotRow>(`
    SELECT title, meta_description, headings, clean_text, content_hash, ctas, pricing, page_language
    FROM page_snapshots WHERE web_page_id=$1 ORDER BY crawled_at DESC LIMIT 1
  `, [pageId]);
  const previous = previousResult.rows[0];

  await query(`
    INSERT INTO page_snapshots (
      id, web_page_id, crawl_run_id, status_code, title, meta_description, headings,
      clean_text, content_hash, ctas, pricing, page_language, raw_html
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12,$13)
  `, [
    randomUUID(), pageId, args.runId, args.status, args.parsed.title, args.parsed.metaDescription,
    JSON.stringify(args.parsed.headings), args.parsed.cleanText, args.parsed.contentHash,
    JSON.stringify(args.parsed.ctas), JSON.stringify(args.parsed.pricing), args.parsed.language, args.html,
  ]);

  if (!args.hasBaseline) return { changed: false, events: 0 };
  if (!previous) {
    await createEvent(args.brandId, args.competitorId, pageId, "new_page", "medium", `New page detected: ${args.parsed.title || args.url}`, null, { url: args.url, title: args.parsed.title });
    return { changed: true, events: 1 };
  }
  if (previous.content_hash === args.parsed.contentHash) return { changed: false, events: 0 };

  let events = 0;
  const oldPrices = JSON.stringify([...(previous.pricing ?? [])].sort());
  const newPrices = JSON.stringify([...args.parsed.pricing].sort());
  if (oldPrices !== newPrices) {
    await createEvent(args.brandId, args.competitorId, pageId, "pricing_change", "high",
      `Pricing or price-related text changed on ${args.parsed.title || args.url}.`,
      { pricing: previous.pricing ?? [] }, { pricing: args.parsed.pricing });
    events += 1;
  }

  if (previous.title !== args.parsed.title) {
    await createEvent(args.brandId, args.competitorId, pageId, "title_change", "medium",
      `Page title changed on ${args.url}.`, { title: previous.title }, { title: args.parsed.title });
    events += 1;
  }

  const oldCtas = JSON.stringify([...(previous.ctas ?? [])].sort());
  const newCtas = JSON.stringify([...args.parsed.ctas].sort());
  if (oldCtas !== newCtas) {
    await createEvent(args.brandId, args.competitorId, pageId, "cta_change", "medium",
      `Call-to-action messaging changed on ${args.parsed.title || args.url}.`,
      { ctas: previous.ctas ?? [] }, { ctas: args.parsed.ctas });
    events += 1;
  }

  const ratio = textChangeRatio(previous.clean_text, args.parsed.cleanText);
  if (ratio >= 0.03) {
    const importance: ChangeImportance = ratio >= 0.22 ? "high" : ratio >= 0.08 ? "medium" : "low";
    const excerpt = firstChangedExcerpt(previous.clean_text, args.parsed.cleanText);
    await createEvent(args.brandId, args.competitorId, pageId, "content_change", importance,
      `Meaningful page content changed on ${args.parsed.title || args.url} (${Math.round(ratio * 100)}% vocabulary difference).`,
      { excerpt: excerpt.old }, { excerpt: excerpt.new });
    events += 1;
  }

  return { changed: events > 0, events };
}

async function recordUnavailablePage(args: { competitorId: string; brandId: string; runId: string; url: string; status: number; hasBaseline: boolean }): Promise<boolean> {
  const existing = await query<PageRow>(`SELECT id, active FROM web_pages WHERE competitor_id=$1 AND url=$2`, [args.competitorId, args.url]);
  const page = existing.rows[0];
  if (!page) return false;
  await query(`UPDATE web_pages SET last_seen_run_id=$2, last_seen_at=NOW() WHERE id=$1`, [page.id, args.runId]);
  if (!args.hasBaseline || args.status < 400) return false;

  const duplicate = await query<{ id: string }>(`
    SELECT id FROM change_events
    WHERE competitor_id=$1 AND web_page_id=$2 AND event_type='page_unavailable'
      AND new_value->>'status'=$3 AND detected_at >= NOW() - INTERVAL '12 hours'
    ORDER BY detected_at DESC LIMIT 1
  `, [args.competitorId, page.id, String(args.status)]);
  if (duplicate.rows[0]) return false;

  await createEvent(args.brandId, args.competitorId, page.id, "page_unavailable", args.status === 404 || args.status === 410 ? "high" : "medium",
    `Tracked page returned HTTP ${args.status}: ${args.url}`, { available: true }, { available: false, status: args.status });
  return true;
}

async function markRemovedPages(brandId: string, competitorId: string, runId: string): Promise<number> {
  const result = await query<{ id: string; url: string }>(`
    SELECT id, url FROM web_pages
    WHERE competitor_id=$1 AND active=TRUE AND (last_seen_run_id IS NULL OR last_seen_run_id <> $2)
  `, [competitorId, runId]);
  for (const page of result.rows) {
    await query(`UPDATE web_pages SET active=FALSE WHERE id=$1`, [page.id]);
    await createEvent(brandId, competitorId, page.id, "removed_page", "high",
      `Previously tracked page disappeared from the site's complete sitemap: ${page.url}`,
      { active: true }, { active: false });
  }
  return result.rows.length;
}

async function createEvent(
  brandId: string,
  competitorId: string,
  pageId: string | null,
  eventType: string,
  importance: ChangeImportance,
  summary: string,
  oldValue: unknown,
  newValue: unknown,
) {
  await query(`
    INSERT INTO change_events (id, brand_id, competitor_id, web_page_id, event_type, importance, summary, old_value, new_value)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
  `, [randomUUID(), brandId, competitorId, pageId, eventType, importance, summary, oldValue === null ? null : JSON.stringify(oldValue), newValue === null ? null : JSON.stringify(newValue)]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
