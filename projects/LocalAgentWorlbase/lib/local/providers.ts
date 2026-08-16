"use client";

import type { ChatMessage, LocalModelConfig, ModelDescriptor } from "@/lib/types";
import { readNdjson, readSseJson } from "@/lib/stream";

function stripTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function llamaRoot(baseUrl: string): string {
  return stripTrailingSlash(baseUrl).replace(/\/v1$/, "");
}

function dataUrlBase64(dataUrl?: string): string | null {
  if (!dataUrl) return null;
  const match = /^data:[^;,]+;base64,(.+)$/s.exec(dataUrl);
  return match?.[1] ?? null;
}

function attachmentText(message: ChatMessage): string {
  return (message.attachments ?? [])
    .filter((item) => typeof item.text === "string")
    .map((item) => `\n\n<attachment name="${item.name}">\n${item.text}\n</attachment>`)
    .join("");
}

export async function discoverLocalModels(config: LocalModelConfig): Promise<ModelDescriptor[]> {
  if (config.runtime === "ollama") {
    const response = await fetch(`${stripTrailingSlash(config.baseUrl)}/api/tags`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      cache: "no-store",
    });
    await assertOk(response, "Ollama");
    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string; details?: { format?: string; family?: string; parameter_size?: string; quantization_level?: string } }>;
    };
    const base = stripTrailingSlash(config.baseUrl);
    const items = await Promise.all((data.models ?? []).map(async (item): Promise<ModelDescriptor> => {
      const id = item.model || item.name || "";
      const detail = [item.details?.format?.toUpperCase(), item.details?.family, item.details?.parameter_size, item.details?.quantization_level]
        .filter(Boolean)
        .join(" · ");
      let capabilities: string[] | undefined;
      try {
        const show = await fetch(`${base}/api/show`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({ model: id, verbose: false }),
          cache: "no-store",
        });
        if (show.ok) {
          const metadata = (await show.json()) as { capabilities?: string[] };
          capabilities = metadata.capabilities;
        }
      } catch {
        // Model listing still works when capability metadata is unavailable.
      }
      return {
        id,
        name: id,
        provider: "ollama" as const,
        description: detail || undefined,
        vision: capabilities?.includes("vision"),
        capabilities,
      };
    }));
    return items.filter((item) => item.id);
  }

  const response = await fetch(`${llamaRoot(config.baseUrl)}/v1/models`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
    cache: "no-store",
  });
  await assertOk(response, "llama.cpp");
  const data = (await response.json()) as {
    data?: Array<{
      id?: string;
      architecture?: { input_modalities?: string[] };
      meta?: { n_params?: number; size?: number } | null;
    }>;
  };
  const root = llamaRoot(config.baseUrl);
  const items = await Promise.all((data.data ?? []).map(async (item): Promise<ModelDescriptor> => {
    const id = item.id ?? "";
    let vision = item.architecture?.input_modalities?.includes("image");
    if (vision === undefined && id) {
      try {
        const props = await fetch(`${root}/props?model=${encodeURIComponent(id)}`, {
          headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
          cache: "no-store",
        });
        if (props.ok) {
          const metadata = (await props.json()) as { modalities?: { vision?: boolean } };
          vision = metadata.modalities?.vision;
        }
      } catch {
        // Model discovery still succeeds when optional capability metadata is unavailable.
      }
    }
    return {
      id,
      name: id || "llama.cpp model",
      provider: "llamacpp" as const,
      vision,
      capabilities: vision ? ["completion", "vision"] : ["completion"],
      description: item.meta?.n_params ? `${formatParams(item.meta.n_params)} parameters` : undefined,
    };
  }));
  return items.filter((item) => item.id);
}

export async function streamLocalChat(args: {
  config: LocalModelConfig;
  systemPrompt?: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  if (args.config.runtime === "ollama") {
    await streamOllama(args);
    return;
  }
  await streamLlamaCpp(args);
}

async function streamOllama(args: {
  config: LocalModelConfig;
  systemPrompt?: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}) {
  const messages: Array<{ role: string; content: string; images?: string[] }> = [];
  if (args.systemPrompt) messages.push({ role: "system", content: args.systemPrompt });

  for (const message of args.messages) {
    const images = (message.attachments ?? [])
      .filter((item) => item.mimeType.startsWith("image/"))
      .map((item) => dataUrlBase64(item.dataUrl))
      .filter((item): item is string => Boolean(item));
    messages.push({
      role: message.role,
      content: `${message.content}${attachmentText(message)}`,
      images: images.length ? images : undefined,
    });
  }

  const response = await fetch(`${stripTrailingSlash(args.config.baseUrl)}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(args.config.apiKey ? { Authorization: `Bearer ${args.config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: args.config.model, messages, stream: true }),
    signal: args.signal,
  });
  await assertOk(response, "Ollama");
  if (!response.body) throw new Error("Ollama returned an empty response stream.");

  for await (const event of readNdjson(response.body)) {
    const item = event as { message?: { content?: string }; error?: string };
    if (item.error) throw new Error(item.error);
    if (item.message?.content) args.onDelta(item.message.content);
  }
}

async function streamLlamaCpp(args: {
  config: LocalModelConfig;
  systemPrompt?: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}) {
  const messages: unknown[] = [];
  if (args.systemPrompt) messages.push({ role: "system", content: args.systemPrompt });

  for (const message of args.messages) {
    const images = (message.attachments ?? []).filter((item) => item.mimeType.startsWith("image/") && item.dataUrl);
    if (message.role === "user" && images.length) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `${message.content}${attachmentText(message)}` },
          ...images.map((item) => ({ type: "image_url", image_url: { url: item.dataUrl } })),
        ],
      });
    } else {
      messages.push({ role: message.role, content: `${message.content}${attachmentText(message)}` });
    }
  }

  const response = await fetch(`${llamaRoot(args.config.baseUrl)}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(args.config.apiKey ? { Authorization: `Bearer ${args.config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: args.config.model, messages, stream: true }),
    signal: args.signal,
  });
  await assertOk(response, "llama.cpp");
  if (!response.body) throw new Error("llama.cpp returned an empty response stream.");

  for await (const event of readSseJson(response.body)) {
    const item = event as {
      choices?: Array<{ delta?: { content?: string } }>;
      error?: { message?: string } | string;
    };
    if (item.error) {
      throw new Error(typeof item.error === "string" ? item.error : item.error.message || "llama.cpp request failed.");
    }
    const text = item.choices?.[0]?.delta?.content;
    if (text) args.onDelta(text);
  }
}

async function assertOk(response: Response, runtime: string) {
  if (response.ok) return;
  const text = await response.text().catch(() => "");
  let detail = text;
  if (text) {
    try {
      const data = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
      detail = typeof data.error === "string" ? data.error : data.error?.message || data.message || text;
    } catch {
      // Keep plain-text error body.
    }
  }
  throw new Error(`${runtime} connection failed (${response.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
}

function formatParams(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString();
}
