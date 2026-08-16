import "server-only";

import { randomUUID } from "node:crypto";
import { query } from "@/server/db/pool";
import type { Brand, ChangeEvent, Competitor, DashboardSummary } from "@/lib/intelligence/types";

type BrandInput = Omit<Brand, "id" | "createdAt" | "updatedAt">;
type CompetitorInput = Omit<Competitor, "id" | "createdAt" | "updatedAt" | "lastCrawledAt" | "lastCrawlStatus">;

type BrandRow = {
  id: string;
  name: string;
  website: string;
  industry: string;
  description: string;
  services: string[];
  target_customers: string[];
  countries: string[];
  languages: string[];
  keywords: string[];
  social_profiles: Record<string, string>;
  positioning: string;
  value_proposition: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type CompetitorRow = {
  id: string;
  brand_id: string;
  name: string;
  website: string;
  description: string;
  industry: string;
  country: string;
  markets: string[];
  social_profiles: Record<string, string>;
  created_at: Date | string;
  updated_at: Date | string;
  last_crawled_at?: Date | string | null;
  last_crawl_status?: string | null;
};

type ChangeRow = {
  id: string;
  brand_id: string;
  competitor_id: string;
  competitor_name?: string;
  web_page_id?: string | null;
  url?: string | null;
  event_type: string;
  importance: ChangeEvent["importance"];
  summary: string;
  old_value?: unknown;
  new_value?: unknown;
  detected_at: Date | string;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    description: row.description,
    services: row.services ?? [],
    targetCustomers: row.target_customers ?? [],
    countries: row.countries ?? [],
    languages: row.languages ?? [],
    keywords: row.keywords ?? [],
    socialProfiles: row.social_profiles ?? {},
    positioning: row.positioning,
    valueProposition: row.value_proposition,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapCompetitor(row: CompetitorRow): Competitor {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    website: row.website,
    description: row.description,
    industry: row.industry,
    country: row.country,
    markets: row.markets ?? [],
    socialProfiles: row.social_profiles ?? {},
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    lastCrawledAt: iso(row.last_crawled_at),
    lastCrawlStatus: row.last_crawl_status ?? null,
  };
}

function mapChange(row: ChangeRow): ChangeEvent {
  return {
    id: row.id,
    brandId: row.brand_id,
    competitorId: row.competitor_id,
    competitorName: row.competitor_name,
    webPageId: row.web_page_id,
    url: row.url,
    eventType: row.event_type,
    importance: row.importance,
    summary: row.summary,
    oldValue: row.old_value,
    newValue: row.new_value,
    detectedAt: iso(row.detected_at)!,
  };
}

export async function listBrands(): Promise<Brand[]> {
  const result = await query<BrandRow>("SELECT * FROM brands ORDER BY updated_at DESC");
  return result.rows.map(mapBrand);
}

export async function getBrand(id: string): Promise<Brand | null> {
  const result = await query<BrandRow>("SELECT * FROM brands WHERE id = $1", [id]);
  return result.rows[0] ? mapBrand(result.rows[0]) : null;
}

export async function createBrand(input: BrandInput): Promise<Brand> {
  const id = randomUUID();
  const result = await query<BrandRow>(`
    INSERT INTO brands (
      id, name, website, industry, description, services, target_customers,
      countries, languages, keywords, social_profiles, positioning, value_proposition
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)
    RETURNING *
  `, [
    id, input.name, input.website, input.industry, input.description,
    JSON.stringify(input.services), JSON.stringify(input.targetCustomers),
    JSON.stringify(input.countries), JSON.stringify(input.languages), JSON.stringify(input.keywords),
    JSON.stringify(input.socialProfiles), input.positioning, input.valueProposition,
  ]);
  return mapBrand(result.rows[0]);
}

export async function updateBrand(id: string, input: BrandInput): Promise<Brand | null> {
  const result = await query<BrandRow>(`
    UPDATE brands SET
      name=$2, website=$3, industry=$4, description=$5, services=$6::jsonb,
      target_customers=$7::jsonb, countries=$8::jsonb, languages=$9::jsonb,
      keywords=$10::jsonb, social_profiles=$11::jsonb, positioning=$12,
      value_proposition=$13, updated_at=NOW()
    WHERE id=$1
    RETURNING *
  `, [
    id, input.name, input.website, input.industry, input.description,
    JSON.stringify(input.services), JSON.stringify(input.targetCustomers), JSON.stringify(input.countries),
    JSON.stringify(input.languages), JSON.stringify(input.keywords), JSON.stringify(input.socialProfiles),
    input.positioning, input.valueProposition,
  ]);
  return result.rows[0] ? mapBrand(result.rows[0]) : null;
}

export async function deleteBrand(id: string): Promise<boolean> {
  const result = await query("DELETE FROM brands WHERE id=$1", [id]);
  return (result.rowCount ?? 0) > 0;
}

const COMPETITOR_SELECT = `
  SELECT c.*,
    last_run.completed_at AS last_crawled_at,
    last_run.status AS last_crawl_status
  FROM competitors c
  LEFT JOIN LATERAL (
    SELECT completed_at, status
    FROM crawl_runs
    WHERE competitor_id=c.id
    ORDER BY started_at DESC
    LIMIT 1
  ) last_run ON TRUE
`;

export async function listCompetitors(brandId: string): Promise<Competitor[]> {
  const result = await query<CompetitorRow>(`${COMPETITOR_SELECT} WHERE c.brand_id=$1 ORDER BY c.name ASC`, [brandId]);
  return result.rows.map(mapCompetitor);
}

export async function getCompetitor(id: string): Promise<Competitor | null> {
  const result = await query<CompetitorRow>(`${COMPETITOR_SELECT} WHERE c.id=$1`, [id]);
  return result.rows[0] ? mapCompetitor(result.rows[0]) : null;
}

export async function createCompetitor(input: CompetitorInput): Promise<Competitor> {
  const id = randomUUID();
  const result = await query<CompetitorRow>(`
    INSERT INTO competitors (
      id, brand_id, name, website, description, industry, country, markets, social_profiles
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
    RETURNING *, NULL::timestamptz AS last_crawled_at, NULL::text AS last_crawl_status
  `, [
    id, input.brandId, input.name, input.website, input.description, input.industry,
    input.country, JSON.stringify(input.markets), JSON.stringify(input.socialProfiles),
  ]);
  return mapCompetitor(result.rows[0]);
}

export async function updateCompetitor(id: string, input: CompetitorInput): Promise<Competitor | null> {
  const result = await query<CompetitorRow>(`
    UPDATE competitors SET
      brand_id=$2, name=$3, website=$4, description=$5, industry=$6,
      country=$7, markets=$8::jsonb, social_profiles=$9::jsonb, updated_at=NOW()
    WHERE id=$1
    RETURNING *, NULL::timestamptz AS last_crawled_at, NULL::text AS last_crawl_status
  `, [
    id, input.brandId, input.name, input.website, input.description, input.industry,
    input.country, JSON.stringify(input.markets), JSON.stringify(input.socialProfiles),
  ]);
  return result.rows[0] ? mapCompetitor(result.rows[0]) : null;
}

export async function deleteCompetitor(id: string): Promise<boolean> {
  const result = await query("DELETE FROM competitors WHERE id=$1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listChanges(brandId: string, limit = 100): Promise<ChangeEvent[]> {
  const safeLimit = Math.max(1, Math.min(limit, 250));
  const result = await query<ChangeRow>(`
    SELECT e.*, c.name AS competitor_name, p.url
    FROM change_events e
    JOIN competitors c ON c.id=e.competitor_id
    LEFT JOIN web_pages p ON p.id=e.web_page_id
    WHERE e.brand_id=$1
    ORDER BY e.detected_at DESC
    LIMIT $2
  `, [brandId, safeLimit]);
  return result.rows.map(mapChange);
}

export async function getDashboardSummary(brandId: string): Promise<DashboardSummary | null> {
  const brand = await getBrand(brandId);
  if (!brand) return null;
  const [competitors, recentChanges, counts] = await Promise.all([
    listCompetitors(brandId),
    listChanges(brandId, 20),
    query<{ competitor_count: string; changes_24h: string; high_priority: string; pages_tracked: string }>(`
      SELECT
        (SELECT COUNT(*) FROM competitors WHERE brand_id=$1)::text AS competitor_count,
        (SELECT COUNT(*) FROM change_events WHERE brand_id=$1 AND detected_at >= NOW() - INTERVAL '24 hours')::text AS changes_24h,
        (SELECT COUNT(*) FROM change_events WHERE brand_id=$1 AND importance IN ('high','critical') AND detected_at >= NOW() - INTERVAL '7 days')::text AS high_priority,
        (SELECT COUNT(*) FROM web_pages p JOIN competitors c ON c.id=p.competitor_id WHERE c.brand_id=$1 AND p.active=TRUE)::text AS pages_tracked
    `, [brandId]),
  ]);
  const row = counts.rows[0];
  return {
    brand,
    competitorCount: Number(row.competitor_count),
    changes24h: Number(row.changes_24h),
    highPriorityChanges: Number(row.high_priority),
    pagesTracked: Number(row.pages_tracked),
    recentChanges,
    competitors,
  };
}
