import "server-only";

import * as cheerio from "cheerio";
import { safeFetchText } from "@/server/crawler/fetch";
import { canonicalUrl } from "@/server/crawler/parser";
import { sameOrigin } from "@/server/crawler/security";

export async function discoverSitemapUrls(
  sitemapUrls: string[],
  origin: string,
  maxUrls = 500,
): Promise<{ urls: string[]; complete: boolean }> {
  const queue = [...new Set(sitemapUrls)].slice(0, 20);
  const visited = new Set<string>();
  const pages = new Set<string>();
  let complete = true;

  while (queue.length && pages.size < maxUrls) {
    const sitemap = queue.shift()!;
    if (visited.has(sitemap)) continue;
    visited.add(sitemap);
    try {
      const response = await safeFetchText(sitemap, { maxBytes: 3_000_000, accept: "application/xml,text/xml,text/plain,*/*;q=0.1" });
      if (response.status < 200 || response.status >= 300 || !sameOrigin(response.url, origin)) { complete = false; continue; }
      const $ = cheerio.load(response.text, { xmlMode: true });
      const sitemapChildren = $("sitemap > loc").map((_, element) => $(element).text().trim()).get();
      if (sitemapChildren.length) {
        for (const child of sitemapChildren) {
          if (visited.size + queue.length >= 50) { complete = false; break; }
          try {
            const url = new URL(child, sitemap);
            if (url.origin === origin) queue.push(url.toString());
          } catch { complete = false; }
        }
        continue;
      }

      for (const raw of $("url > loc").map((_, element) => $(element).text().trim()).get()) {
        try {
          const url = new URL(raw, sitemap);
          if (!sameOrigin(url.toString(), origin) || !isCrawlablePage(url)) continue;
          pages.add(canonicalUrl(url));
          if (pages.size >= maxUrls) { complete = false; break; }
        } catch { /* Ignore malformed sitemap URLs. */ }
      }
    } catch {
      complete = false;
    }
  }

  if (queue.length) complete = false;
  return { urls: [...pages], complete };
}

export function isCrawlablePage(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  if (/\.(?:jpg|jpeg|png|gif|webp|svg|ico|pdf|zip|rar|7z|gz|mp4|mov|avi|mp3|wav|css|js|json|xml|woff2?|ttf|eot)$/i.test(path)) return false;
  return true;
}
