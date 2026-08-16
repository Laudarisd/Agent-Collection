import "server-only";

import { assertPublicHttpUrl } from "@/server/crawler/security";

const USER_AGENT = "AIWorkspace-CompetitorMonitor/1.0";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

export type FetchedResource = {
  url: string;
  status: number;
  contentType: string;
  text: string;
};

export async function safeFetchText(
  input: string,
  options: { maxBytes?: number; timeoutMs?: number; accept?: string } = {},
): Promise<FetchedResource> {
  let current = (await assertPublicHttpUrl(input)).toString();
  const maxBytes = options.maxBytes ?? 2_500_000;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHttpUrl(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect from ${current} did not include a Location header.`);
      current = new URL(location, current).toString();
      continue;
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw new Error(`Response from ${current} exceeds the ${formatBytes(maxBytes)} crawler limit.`);
    const text = await readLimitedText(response, maxBytes);
    return {
      url: current,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
    };
  }

  throw new Error(`Too many redirects while fetching ${input}.`);
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new Error(`Response body exceeds the ${formatBytes(maxBytes)} crawler limit.`);
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function formatBytes(value: number): string {
  return value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`;
}
