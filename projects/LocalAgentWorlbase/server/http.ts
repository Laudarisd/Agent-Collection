import "server-only";

import { NextResponse } from "next/server";

export class RequestInputError extends Error {}

export function apiError(error: unknown, fallback = "Request failed.") {
  const message = error instanceof Error ? error.message : fallback;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const status = error instanceof RequestInputError
    ? 400
    : code === "23505"
      ? 409
      : code === "23503"
        ? 400
        : message.includes("DATABASE_URL")
          ? 503
          : 500;
  return NextResponse.json({ error: code === "23505" ? "That record already exists." : message }, { status });
}

export function cleanText(value: unknown, max = 5000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function requiredText(value: unknown, field: string, max = 5000): string {
  const text = cleanText(value, max);
  if (!text) throw new RequestInputError(`${field} is required.`);
  return text;
}

export function stringArray(value: unknown, maxItems = 50, maxLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function stringRecord(value: unknown, maxItems = 30): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string")
    .slice(0, maxItems)
    .map(([key, item]) => [key.slice(0, 80), String(item).trim().slice(0, 1000)]));
}

export function publicWebsite(value: unknown): string {
  const raw = cleanText(value, 2000);
  if (!raw) throw new RequestInputError("Website is required.");
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try { url = new URL(withProtocol); } catch { throw new RequestInputError("Website URL is invalid."); }
  if (!/^(https?):$/.test(url.protocol)) throw new RequestInputError("Website must use HTTP or HTTPS.");
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
