import { streamCloudChat } from "@/lib/cloud/providers";
import type { ChatRequest, CloudProvider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set<CloudProvider>(["openai", "anthropic", "gemini"]);
const MAX_REQUEST_CHARS = 12_000_000;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_CHARS) {
      return new Response("Request is too large.", { status: 413 });
    }

    const body = JSON.parse(raw) as ChatRequest;
    if (!PROVIDERS.has(body.provider as CloudProvider)) {
      return new Response("Local runtimes are called directly from the browser.", { status: 400 });
    }
    if (!body.apiKey?.trim()) return new Response("API key is required.", { status: 400 });
    if (!body.model?.trim()) return new Response("Model is required.", { status: 400 });
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response("At least one message is required.", { status: 400 });
    }

    const stream = await streamCloudChat({
      provider: body.provider as CloudProvider,
      apiKey: body.apiKey.trim(),
      model: body.model.trim(),
      systemPrompt: body.systemPrompt,
      messages: body.messages,
      signal: request.signal,
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed.";
    return new Response(message, { status: 502 });
  }
}
