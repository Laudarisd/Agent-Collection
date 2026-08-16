import "server-only";

import { getBrand, listChanges, listCompetitors } from "@/server/db/repositories";
import { query } from "@/server/db/pool";

type PageEvidenceRow = {
  competitor_name: string;
  url: string;
  title: string;
  meta_description: string;
  clean_text: string;
  ctas: string[];
  pricing: string[];
  crawled_at: Date | string;
};

export async function buildIntelligenceContext(brandId: string, question: string): Promise<string> {
  const [brand, competitors, changes, pagesResult] = await Promise.all([
    getBrand(brandId),
    listCompetitors(brandId),
    listChanges(brandId, 40),
    query<PageEvidenceRow>(`
      SELECT c.name AS competitor_name, p.url, s.title, s.meta_description,
        s.clean_text, s.ctas, s.pricing, s.crawled_at
      FROM web_pages p
      JOIN competitors c ON c.id=p.competitor_id
      JOIN LATERAL (
        SELECT title, meta_description, clean_text, ctas, pricing, crawled_at
        FROM page_snapshots
        WHERE web_page_id=p.id
        ORDER BY crawled_at DESC
        LIMIT 1
      ) s ON TRUE
      WHERE c.brand_id=$1 AND p.active=TRUE
      ORDER BY s.crawled_at DESC
      LIMIT 80
    `, [brandId]),
  ]);

  if (!brand) return "No brand workspace was found for the selected brand.";
  const terms = extractTerms(question);
  const evidence = pagesResult.rows
    .map((page) => ({ page, score: evidenceScore(page, terms) }))
    .sort((a, b) => b.score - a.score || new Date(b.page.crawled_at).getTime() - new Date(a.page.crawled_at).getTime())
    .slice(0, 10)
    .map(({ page }) => ({
      competitor: page.competitor_name,
      url: page.url,
      title: page.title,
      metaDescription: page.meta_description,
      ctas: page.ctas ?? [],
      pricing: page.pricing ?? [],
      excerpt: relevantExcerpt(page.clean_text, terms, 1400),
      crawledAt: new Date(page.crawled_at).toISOString(),
    }));

  const payload = {
    brand: {
      name: brand.name,
      website: brand.website,
      industry: brand.industry,
      description: brand.description,
      services: brand.services,
      targetCustomers: brand.targetCustomers,
      countries: brand.countries,
      languages: brand.languages,
      keywords: brand.keywords,
      positioning: brand.positioning,
      valueProposition: brand.valueProposition,
    },
    competitors: competitors.map((item) => ({
      name: item.name,
      website: item.website,
      country: item.country,
      markets: item.markets,
      description: item.description,
      lastCrawledAt: item.lastCrawledAt,
    })),
    recentChanges: changes.map((item) => ({
      competitor: item.competitorName,
      type: item.eventType,
      importance: item.importance,
      summary: item.summary,
      url: item.url,
      detectedAt: item.detectedAt,
      oldValue: item.oldValue,
      newValue: item.newValue,
    })),
    relevantPageEvidence: evidence,
  };

  const serialized = JSON.stringify(payload, null, 2);
  return [
    "You have access to the following private competitive-marketing intelligence retrieved from this application's database.",
    "Use it as evidence. Distinguish observed facts from inference. Do not invent competitor activity that is not present. When useful, mention the supporting page URL or change event. If the evidence is insufficient, say what is missing.",
    "\n<marketing_intelligence_context>",
    serialized.slice(0, 42_000),
    "</marketing_intelligence_context>",
  ].join("\n");
}

function extractTerms(question: string): string[] {
  const stop = new Set(["what", "when", "where", "which", "with", "that", "this", "from", "have", "does", "doing", "about", "their", "there", "should", "could", "would", "competitor", "competitors", "recently", "change", "changed", "brand", "marketing"]);
  return [...new Set(question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [])]
    .filter((term) => !stop.has(term))
    .slice(0, 12);
}

function evidenceScore(page: PageEvidenceRow, terms: string[]): number {
  if (!terms.length) return 1;
  const title = `${page.competitor_name} ${page.title}`.toLowerCase();
  const body = `${page.meta_description} ${page.clean_text.slice(0, 40_000)}`.toLowerCase();
  return terms.reduce((score, term) => score + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 1 : 0), 0);
}

function relevantExcerpt(text: string, terms: string[], maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const lower = normalized.toLowerCase();
  const match = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, match - Math.floor(maxLength * 0.25));
  return `${start > 0 ? "…" : ""}${normalized.slice(start, start + maxLength)}${start + maxLength < normalized.length ? "…" : ""}`;
}
