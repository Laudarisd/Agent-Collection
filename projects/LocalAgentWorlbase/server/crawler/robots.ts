import "server-only";

import { safeFetchText } from "@/server/crawler/fetch";
import { sameOrigin } from "@/server/crawler/security";

type RobotRule = { allow: boolean; pattern: string };

export type RobotsPolicy = {
  sitemaps: string[];
  crawlDelayMs: number;
  allows: (url: string) => boolean;
};

const BOT_TOKEN = "aiworkspace-competitormonitor";

function patternMatches(path: string, pattern: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const source = pattern
    .replace(/\$$/, "")
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const expression = new RegExp(`^${source}${anchored ? "$" : ""}`);
  return expression.test(path);
}

export async function loadRobotsPolicy(origin: string): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  let text = "";
  try {
    const response = await safeFetchText(robotsUrl, { maxBytes: 300_000, accept: "text/plain,*/*;q=0.1" });
    if (!sameOrigin(response.url, origin)) throw new Error("Website robots policy redirected outside the competitor domain.");
    if (response.status === 404 || response.status === 410) return unrestricted();
    if (response.status === 401 || response.status === 403) throw new Error("Website robots policy does not allow crawler access.");
    if (response.status === 429 || response.status >= 500) throw new Error("Website robots policy is temporarily unavailable; crawl was not attempted.");
    if (response.status >= 400) return unrestricted();
    text = response.text;
  } catch (error) {
    if (error instanceof Error && /robots policy/.test(error.message)) throw error;
    return unrestricted();
  }

  const groups: Array<{ agents: string[]; rules: RobotRule[]; delay?: number }> = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: RobotRule[]; delay?: number } | null = null;
  let seenDirective = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || !line.includes(":")) continue;
    const colon = line.indexOf(":");
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "sitemap") {
      try { sitemaps.push(new URL(value, origin).toString()); } catch { /* Ignore malformed sitemap entries. */ }
      continue;
    }

    if (key === "user-agent") {
      if (!current || seenDirective) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenDirective = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      seenDirective = true;
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      seenDirective = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delay = seconds;
    }
  }

  const exact = groups.filter((group) => group.agents.some((agent) => BOT_TOKEN.startsWith(agent) || agent.startsWith(BOT_TOKEN)));
  const applicable = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  const rules = applicable.flatMap((group) => group.rules);
  const crawlDelayMs = Math.min(10_000, Math.max(0, ...applicable.map((group) => (group.delay ?? 0) * 1000)));

  return {
    sitemaps: [...new Set(sitemaps)],
    crawlDelayMs,
    allows(url: string) {
      const target = new URL(url);
      const path = `${target.pathname}${target.search}`;
      const matches = rules
        .filter((rule) => patternMatches(path, rule.pattern))
        .sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
      return matches[0]?.allow ?? true;
    },
  };
}

function unrestricted(): RobotsPolicy {
  return { sitemaps: [], crawlDelayMs: 0, allows: () => true };
}
