import "server-only";

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

export type ParsedPage = {
  title: string;
  metaDescription: string;
  headings: string[];
  cleanText: string;
  contentHash: string;
  ctas: string[];
  pricing: string[];
  language: string;
  links: string[];
};

const CTA_PATTERN = /(?:\b(?:book|consult|consultation|contact|free|assessment|quote|schedule|start|apply|reserve|learn more|get started|shop|buy|request)\b|상담|예약|문의|무료|견적|konsultasi|hubungi|daftar|予約|相談|お問い合わせ|咨询|预约|联系)/i;
const PRICE_PATTERN = /(?:₩\s?\d[\d,.]*|\$\s?\d[\d,.]*|€\s?\d[\d,.]*|£\s?\d[\d,.]*|\d[\d,.]*\s?(?:KRW|USD|EUR|GBP|원|만원))/gi;

function normalizeSpace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = normalizeSpace(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

export function parseHtmlPage(html: string, finalUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  $("script,style,noscript,template,svg,canvas").remove();

  const title = normalizeSpace($("title").first().text()).slice(0, 500);
  const metaDescription = normalizeSpace($("meta[name='description']").attr("content") || "").slice(0, 1000);
  const headings = unique($("h1,h2,h3").map((_, element) => $(element).text()).get(), 80);
  const ctas = unique($("a,button,[role='button']").map((_, element) => $(element).text()).get().filter((value) => CTA_PATTERN.test(value)), 40);
  const cleanText = normalizeSpace($("body").text()).slice(0, 300_000);
  const pricing = unique(cleanText.match(PRICE_PATTERN) || [], 40);
  const language = normalizeSpace($("html").attr("lang") || "").slice(0, 30);

  const base = new URL(finalUrl);
  const links = unique($("a[href]").map((_, element) => {
    const href = $(element).attr("href");
    if (!href) return "";
    try {
      const url = new URL(href, base);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (url.origin !== base.origin) return "";
      url.hash = "";
      return canonicalUrl(url);
    } catch {
      return "";
    }
  }).get(), 500);

  const canonical = [title, metaDescription, headings.join("\n"), ctas.join("\n"), pricing.join("\n"), cleanText].join("\n---\n");
  const contentHash = createHash("sha256").update(canonical).digest("hex");

  return { title, metaDescription, headings, cleanText, contentHash, ctas, pricing, language, links };
}

export function canonicalUrl(url: URL): string {
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) url.searchParams.delete(key);
  }
  const result = url.toString();
  return result.endsWith("/") && url.pathname !== "/" ? result.slice(0, -1) : result;
}

export function textChangeRatio(previous: string, next: string): number {
  const tokens = (value: string) => (value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 12_000);
  const a = new Set(tokens(previous));
  const b = new Set(tokens(next));
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? 1 - intersection / union : 0;
}

export function firstChangedExcerpt(previous: string, next: string, length = 260): { old: string; new: string } {
  const a = previous.split(/\s+/);
  const b = next.split(/\s+/);
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
  const start = Math.max(0, index - 12);
  const take = Math.max(20, Math.floor(length / 7));
  return {
    old: a.slice(start, start + take).join(" ").slice(0, length),
    new: b.slice(start, start + take).join(" ").slice(0, length),
  };
}
