import type { CloudProvider } from "@/lib/types";

export function detectCloudProvider(apiKey: string): CloudProvider | null {
  const key = apiKey.trim();
  if (!key) return null;

  if (/^sk-ant-/i.test(key)) return "anthropic";
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) return "gemini";
  if (/^sk-(proj-|svcacct-)?[0-9A-Za-z_-]{16,}$/i.test(key)) return "openai";

  return null;
}

export function providerLabel(provider: CloudProvider): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Claude";
  return "Gemini";
}
