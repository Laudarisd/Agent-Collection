export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_customers JSONB NOT NULL DEFAULT '[]'::jsonb,
  countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_profiles JSONB NOT NULL DEFAULT '{}'::jsonb,
  positioning TEXT NOT NULL DEFAULT '',
  value_proposition TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_profiles JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, website)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id UUID PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_changed INTEGER NOT NULL DEFAULT 0,
  events_created INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS web_pages (
  id UUID PRIMARY KEY,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_run_id UUID REFERENCES crawl_runs(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (competitor_id, url)
);

CREATE TABLE IF NOT EXISTS page_snapshots (
  id UUID PRIMARY KEY,
  web_page_id UUID NOT NULL REFERENCES web_pages(id) ON DELETE CASCADE,
  crawl_run_id UUID NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_code INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  headings JSONB NOT NULL DEFAULT '[]'::jsonb,
  clean_text TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  ctas JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_language TEXT NOT NULL DEFAULT '',
  raw_html TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS change_events (
  id UUID PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  web_page_id UUID REFERENCES web_pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  importance TEXT NOT NULL,
  summary TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitors_brand ON competitors(brand_id);
CREATE INDEX IF NOT EXISTS idx_web_pages_competitor ON web_pages(competitor_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_page_time ON page_snapshots(web_page_id, crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_brand_time ON change_events(brand_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_competitor_time ON change_events(competitor_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_competitor_time ON crawl_runs(competitor_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_runs_one_running ON crawl_runs(competitor_id) WHERE status='running';
`;
