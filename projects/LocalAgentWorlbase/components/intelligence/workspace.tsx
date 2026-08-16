"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modals/modal";
import { ArrowRightIcon, ExternalIcon, GlobeIcon, PlusIcon, RefreshIcon, TrashIcon } from "@/components/ui/icons";
import type { Brand, ChangeEvent, Competitor, CrawlResult, DashboardSummary, WorkspaceView } from "@/lib/intelligence/types";

type Props = {
  view: Exclude<WorkspaceView, "chat">;
  brands: Brand[];
  activeBrandId: string | null;
  databaseError: string;
  onSelectBrand: (id: string) => void;
  onReloadBrands: () => Promise<void>;
  onNavigate: (view: WorkspaceView) => void;
};

export function IntelligenceWorkspace(props: Props) {
  const [brandDialog, setBrandDialog] = useState(false);
  const activeBrand = props.brands.find((brand) => brand.id === props.activeBrandId) ?? props.brands[0] ?? null;

  if (props.databaseError && props.brands.length === 0) {
    return <DatabaseSetupState message={props.databaseError} />;
  }

  if (!activeBrand) {
    return (
      <div className="workspace-scroll">
        <div className="workspace-empty-state">
          <div className="empty-logo">MI</div>
          <h1>Create your brand workspace</h1>
          <p>Add your company first. Competitor evidence, website changes, and AI analysis will be grounded against this brand profile.</p>
          <button className="primary-button workspace-cta" onClick={() => setBrandDialog(true)}><PlusIcon size={17} /> Create brand</button>
        </div>
        <BrandDialog open={brandDialog} onClose={() => setBrandDialog(false)} onCreated={async (brand) => {
          await props.onReloadBrands();
          props.onSelectBrand(brand.id);
          setBrandDialog(false);
        }} />
      </div>
    );
  }

  return (
    <div className="workspace-scroll">
      <div className="workspace-page">
        <WorkspaceToolbar
          brands={props.brands}
          activeBrandId={activeBrand.id}
          onSelectBrand={props.onSelectBrand}
          onNewBrand={() => setBrandDialog(true)}
        />
        {props.view === "dashboard" && <DashboardView brand={activeBrand} onNavigate={props.onNavigate} />}
        {props.view === "competitors" && <CompetitorsView brand={activeBrand} onNavigate={props.onNavigate} />}
        {props.view === "changes" && <ChangesView brand={activeBrand} onNavigate={props.onNavigate} />}
      </div>
      <BrandDialog open={brandDialog} onClose={() => setBrandDialog(false)} onCreated={async (brand) => {
        await props.onReloadBrands();
        props.onSelectBrand(brand.id);
        setBrandDialog(false);
      }} />
    </div>
  );
}

function WorkspaceToolbar({ brands, activeBrandId, onSelectBrand, onNewBrand }: {
  brands: Brand[];
  activeBrandId: string;
  onSelectBrand: (id: string) => void;
  onNewBrand: () => void;
}) {
  return (
    <div className="workspace-toolbar">
      <div>
        <span className="workspace-eyebrow">Brand workspace</span>
        <select className="brand-select" value={activeBrandId} onChange={(event) => onSelectBrand(event.target.value)} aria-label="Active brand">
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </div>
      <button className="secondary-button compact-button" onClick={onNewBrand}><PlusIcon size={16} /> New brand</button>
    </div>
  );
}

function DashboardView({ brand, onNavigate }: { brand: Brand; onNavigate: (view: WorkspaceView) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchJson<{ summary: DashboardSummary }>(`/api/intelligence/dashboard?brandId=${encodeURIComponent(brand.id)}`)
      .then((data) => { if (!cancelled) setSummary(data.summary); })
      .catch((cause) => { if (!cancelled) setError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brand.id]);

  return (
    <section>
      <div className="workspace-heading">
        <div><h1>Marketing Intelligence</h1><p>Website evidence and meaningful competitor changes for {brand.name}.</p></div>
        <button className="primary-button compact-button" onClick={() => onNavigate("chat")}>Ask AI <ArrowRightIcon size={16} /></button>
      </div>

      {error && <InlineError message={error} />}
      <div className="metric-grid">
        <Metric label="Competitors" value={loading ? "—" : String(summary?.competitorCount ?? 0)} />
        <Metric label="Changes · 24h" value={loading ? "—" : String(summary?.changes24h ?? 0)} />
        <Metric label="High priority · 7d" value={loading ? "—" : String(summary?.highPriorityChanges ?? 0)} />
        <Metric label="Pages tracked" value={loading ? "—" : String(summary?.pagesTracked ?? 0)} />
      </div>

      <div className="workspace-grid two-col">
        <article className="workspace-card">
          <div className="card-heading"><div><h2>Recent changes</h2><p>Normalized intelligence events from website monitoring.</p></div><button className="text-button" onClick={() => onNavigate("changes")}>View all</button></div>
          {loading ? <LoadingRows /> : summary?.recentChanges.length ? (
            <div className="event-list">{summary.recentChanges.slice(0, 8).map((event) => <ChangeRow key={event.id} event={event} compact />)}</div>
          ) : <EmptyPanel title="No changes yet" text="Run a competitor crawl to establish the first website baseline. Changes are created from later crawls." />}
        </article>

        <article className="workspace-card">
          <div className="card-heading"><div><h2>Competitors</h2><p>Tracked websites in this brand workspace.</p></div><button className="text-button" onClick={() => onNavigate("competitors")}>Manage</button></div>
          {loading ? <LoadingRows /> : summary?.competitors.length ? (
            <div className="competitor-mini-list">{summary.competitors.slice(0, 8).map((competitor) => (
              <div className="competitor-mini" key={competitor.id}>
                <div className="site-avatar"><GlobeIcon size={17} /></div>
                <div><strong>{competitor.name}</strong><span>{hostname(competitor.website)}</span></div>
                <span className={`crawl-status ${competitor.lastCrawlStatus || "idle"}`}>{competitor.lastCrawlStatus || "Not crawled"}</span>
              </div>
            ))}</div>
          ) : <EmptyPanel title="No competitors" text="Add a competitor, then crawl its public website to create the evidence baseline." action="Add competitor" onAction={() => onNavigate("competitors")} />}
        </article>
      </div>
    </section>
  );
}

function CompetitorsView({ brand, onNavigate }: { brand: Brand; onNavigate: (view: WorkspaceView) => void }) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [crawling, setCrawling] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await fetchJson<{ competitors: Competitor[] }>(`/api/competitors?brandId=${encodeURIComponent(brand.id)}`);
      setCompetitors(data.competitors);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [brand.id]);

  async function crawl(competitor: Competitor) {
    setCrawling(competitor.id); setError(""); setCrawlResult(null);
    try {
      const data = await fetchJson<{ result: CrawlResult }>(`/api/competitors/${encodeURIComponent(competitor.id)}/crawl`, { method: "POST" });
      setCrawlResult(data.result);
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setCrawling(null); }
  }

  async function remove(competitor: Competitor) {
    if (!window.confirm(`Delete ${competitor.name} and all of its stored crawl history?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/competitors/${encodeURIComponent(competitor.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      await load();
    } catch (cause) { setError(errorMessage(cause)); }
  }

  return (
    <section>
      <div className="workspace-heading">
        <div><h1>Competitors</h1><p>Add public competitor websites and create repeatable historical snapshots.</p></div>
        <button className="primary-button compact-button" onClick={() => setDialog(true)}><PlusIcon size={16} /> Add competitor</button>
      </div>
      <div className="info-strip">The first successful crawl creates a baseline without change alerts. Run later crawls to detect pricing, CTA, title, content, new-page, removal, and availability changes.</div>
      {error && <InlineError message={error} />}
      {crawlResult && <div className="crawl-result"><strong>Crawl {crawlResult.status}.</strong> {crawlResult.pagesCrawled} pages crawled · {crawlResult.pagesChanged} changed · {crawlResult.eventsCreated} intelligence events.{crawlResult.errors.length ? ` ${crawlResult.errors.length} URL issue(s) recorded.` : ""} <button onClick={() => onNavigate("changes")}>Review changes</button></div>}

      {loading ? <div className="workspace-card"><LoadingRows /></div> : competitors.length ? (
        <div className="competitor-card-grid">
          {competitors.map((competitor) => (
            <article className="competitor-card" key={competitor.id}>
              <div className="competitor-card-top">
                <div className="site-avatar large"><GlobeIcon size={20} /></div>
                <div className="competitor-card-title"><h2>{competitor.name}</h2><a href={competitor.website} target="_blank" rel="noreferrer">{hostname(competitor.website)} <ExternalIcon size={13} /></a></div>
                <button className="icon-button subtle" onClick={() => void remove(competitor)} aria-label={`Delete ${competitor.name}`} title="Delete competitor"><TrashIcon size={16} /></button>
              </div>
              {competitor.description && <p className="competitor-description">{competitor.description}</p>}
              <div className="competitor-meta">
                {competitor.country && <span>{competitor.country}</span>}
                {competitor.markets.length > 0 && <span>{competitor.markets.join(" · ")}</span>}
              </div>
              <div className="crawl-meta">
                <span><small>Last crawl</small><strong>{competitor.lastCrawledAt ? formatDate(competitor.lastCrawledAt) : "Never"}</strong></span>
                <span><small>Status</small><strong className={`status-text ${competitor.lastCrawlStatus || "idle"}`}>{competitor.lastCrawlStatus || "Not crawled"}</strong></span>
              </div>
              <button className="secondary-button full crawl-button" disabled={crawling === competitor.id} onClick={() => void crawl(competitor)}>
                <RefreshIcon size={16} /> {crawling === competitor.id ? "Crawling website…" : competitor.lastCrawledAt ? "Crawl again" : "Create baseline"}
              </button>
            </article>
          ))}
        </div>
      ) : <div className="workspace-card"><EmptyPanel title="No competitors yet" text="Add the first competitor website to start building historical marketing intelligence." action="Add competitor" onAction={() => setDialog(true)} /></div>}

      <CompetitorDialog open={dialog} brand={brand} onClose={() => setDialog(false)} onCreated={async () => { setDialog(false); await load(); }} />
    </section>
  );
}

function ChangesView({ brand, onNavigate }: { brand: Brand; onNavigate: (view: WorkspaceView) => void }) {
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | ChangeEvent["importance"]>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetchJson<{ changes: ChangeEvent[] }>(`/api/changes?brandId=${encodeURIComponent(brand.id)}&limit=200`)
      .then((data) => { if (!cancelled) setChanges(data.changes); })
      .catch((cause) => { if (!cancelled) setError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brand.id]);

  const visible = useMemo(() => filter === "all" ? changes : changes.filter((event) => event.importance === filter), [changes, filter]);

  return (
    <section>
      <div className="workspace-heading">
        <div><h1>Changes</h1><p>Evidence-backed competitor website events, newest first.</p></div>
        <button className="primary-button compact-button" onClick={() => onNavigate("chat")}>Analyze with AI <ArrowRightIcon size={16} /></button>
      </div>
      <div className="filter-row">
        {(["all", "critical", "high", "medium", "low"] as const).map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{titleCase(value)}</button>)}
      </div>
      {error && <InlineError message={error} />}
      <article className="workspace-card event-card">
        {loading ? <LoadingRows /> : visible.length ? <div className="event-list full">{visible.map((event) => <ChangeRow key={event.id} event={event} />)}</div> : <EmptyPanel title={changes.length ? "No changes match this filter" : "No change events yet"} text={changes.length ? "Choose another importance level." : "Create a competitor baseline and run a later crawl to detect meaningful differences."} action={changes.length ? undefined : "Go to competitors"} onAction={changes.length ? undefined : () => onNavigate("competitors")} />}
      </article>
    </section>
  );
}

function ChangeRow({ event, compact = false }: { event: ChangeEvent; compact?: boolean }) {
  return (
    <div className={`change-row ${compact ? "compact" : ""}`}>
      <span className={`importance-dot ${event.importance}`} title={event.importance} />
      <div className="change-content">
        <div className="change-line"><strong>{event.competitorName || "Competitor"}</strong><span className={`importance-pill ${event.importance}`}>{event.importance}</span><time>{relativeTime(event.detectedAt)}</time></div>
        <p>{event.summary}</p>
        {!compact && event.url && <a className="source-link" href={event.url} target="_blank" rel="noreferrer">Open source page <ExternalIcon size={13} /></a>}
      </div>
    </div>
  );
}

function BrandDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (brand: Brand) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", website: "", industry: "", description: "", services: "", targetCustomers: "", countries: "", languages: "", keywords: "", positioning: "", valueProposition: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await fetchJson<{ brand: Brand }>("/api/brands", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          name: form.name, website: form.website, industry: form.industry, description: form.description,
          services: csv(form.services), targetCustomers: csv(form.targetCustomers), countries: csv(form.countries), languages: csv(form.languages), keywords: csv(form.keywords),
          positioning: form.positioning, valueProposition: form.valueProposition, socialProfiles: {},
        }),
      });
      setForm({ name: "", website: "", industry: "", description: "", services: "", targetCustomers: "", countries: "", languages: "", keywords: "", positioning: "", valueProposition: "" });
      await onCreated(data.brand);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title="Create brand workspace" open={open} onClose={onClose} width="680px"><form className="form-stack" onSubmit={submit}>
    <div className="form-grid two"><Field label="Brand name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Field label="Website" required value={form.website} onChange={(value) => setForm({ ...form, website: value })} placeholder="https://yourcompany.com" /></div>
    <div className="form-grid two"><Field label="Industry" value={form.industry} onChange={(value) => setForm({ ...form, industry: value })} /><Field label="Target countries" value={form.countries} onChange={(value) => setForm({ ...form, countries: value })} placeholder="Comma separated" /></div>
    <Field label="Company description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} textarea />
    <div className="form-grid two"><Field label="Services / products" value={form.services} onChange={(value) => setForm({ ...form, services: value })} placeholder="Comma separated" /><Field label="Target customers" value={form.targetCustomers} onChange={(value) => setForm({ ...form, targetCustomers: value })} placeholder="Comma separated" /></div>
    <Field label="Languages" value={form.languages} onChange={(value) => setForm({ ...form, languages: value })} placeholder="Comma separated" />
    <Field label="Priority keywords" value={form.keywords} onChange={(value) => setForm({ ...form, keywords: value })} placeholder="Comma separated" />
    <div className="form-grid two"><Field label="Positioning" value={form.positioning} onChange={(value) => setForm({ ...form, positioning: value })} textarea /><Field label="Value proposition" value={form.valueProposition} onChange={(value) => setForm({ ...form, valueProposition: value })} textarea /></div>
    {error && <InlineError message={error} />}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button></div>
  </form></Modal>;
}

function CompetitorDialog({ open, brand, onClose, onCreated }: { open: boolean; brand: Brand; onClose: () => void; onCreated: (competitor: Competitor) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", website: "", description: "", industry: "", country: "", markets: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await fetchJson<{ competitor: Competitor }>("/api/competitors", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          brandId: brand.id, name: form.name, website: form.website, description: form.description,
          industry: form.industry, country: form.country, markets: csv(form.markets), socialProfiles: {},
        }),
      });
      setForm({ name: "", website: "", description: "", industry: "", country: "", markets: "" });
      await onCreated(data.competitor);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title="Add competitor" open={open} onClose={onClose} width="620px"><form className="form-stack" onSubmit={submit}>
    <div className="form-grid two"><Field label="Competitor name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Field label="Website" required value={form.website} onChange={(value) => setForm({ ...form, website: value })} placeholder="https://competitor.com" /></div>
    <Field label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} textarea />
    <div className="form-grid two"><Field label="Industry" value={form.industry} onChange={(value) => setForm({ ...form, industry: value })} /><Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} /></div>
    <Field label="Markets" value={form.markets} onChange={(value) => setForm({ ...form, markets: value })} placeholder="Comma separated" />
    {error && <InlineError message={error} />}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Adding…" : "Add competitor"}</button></div>
  </form></Modal>;
}

function Field({ label, value, onChange, placeholder, textarea, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; textarea?: boolean; required?: boolean }) {
  return <label className="field"><span>{label}{required ? " *" : ""}</span>{textarea ? <textarea rows={3} value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>; }
function InlineError({ message }: { message: string }) { return <div className="notice error workspace-notice">{message}</div>; }
function LoadingRows() { return <div className="loading-rows"><span /><span /><span /></div>; }
function EmptyPanel({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) { return <div className="panel-empty"><strong>{title}</strong><p>{text}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>; }
function DatabaseSetupState({ message }: { message: string }) { return <div className="workspace-scroll"><div className="workspace-empty-state"><div className="empty-logo">DB</div><h1>Connect PostgreSQL</h1><p>{message}</p><code>DATABASE_URL=postgresql://user:password@localhost:5432/ai_workspace</code><p className="small-note">The GPT-style chat remains available without the intelligence database. Brand, crawler, and change-monitoring features require PostgreSQL.</p></div></div>; }

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}
async function responseError(response: Response): Promise<string> {
  const text = await response.text();
  try { const data = JSON.parse(text) as { error?: string }; return data.error || `Request failed (${response.status}).`; }
  catch { return text || `Request failed (${response.status}).`; }
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Request failed."; }
function csv(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function hostname(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(value);
}
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
