export type WorkspaceView = "chat" | "dashboard" | "competitors" | "changes";

export type Brand = {
  id: string;
  name: string;
  website: string;
  industry: string;
  description: string;
  services: string[];
  targetCustomers: string[];
  countries: string[];
  languages: string[];
  keywords: string[];
  socialProfiles: Record<string, string>;
  positioning: string;
  valueProposition: string;
  createdAt: string;
  updatedAt: string;
};

export type Competitor = {
  id: string;
  brandId: string;
  name: string;
  website: string;
  description: string;
  industry: string;
  country: string;
  markets: string[];
  socialProfiles: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  lastCrawledAt?: string | null;
  lastCrawlStatus?: string | null;
};

export type ChangeImportance = "low" | "medium" | "high" | "critical";

export type ChangeEvent = {
  id: string;
  brandId: string;
  competitorId: string;
  competitorName?: string;
  webPageId?: string | null;
  url?: string | null;
  eventType: string;
  importance: ChangeImportance;
  summary: string;
  oldValue?: unknown;
  newValue?: unknown;
  detectedAt: string;
};

export type DashboardSummary = {
  brand: Brand;
  competitorCount: number;
  changes24h: number;
  highPriorityChanges: number;
  pagesTracked: number;
  recentChanges: ChangeEvent[];
  competitors: Competitor[];
};

export type CrawlResult = {
  runId: string;
  competitorId: string;
  status: "completed" | "partial";
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesChanged: number;
  eventsCreated: number;
  errors: string[];
};
