import type { Attachment, ChatMessage, CloudProvider, ModelDescriptor } from "@/lib/types";
import { readSseJson } from "@/lib/stream";

function dataUrlParts(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function attachmentText(attachments?: Attachment[]): string {
  return (attachments ?? [])
    .filter((item) => typeof item.text === "string")
    .map((item) => `\n\n<attachment name="${item.name}">\n${item.text}\n</attachment>`)
    .join("");
}

function withTextAttachments(message: ChatMessage): string {
  return `${message.content}${attachmentText(message.attachments)}`;
}

function imageAttachments(message: ChatMessage): Attachment[] {
  return (message.attachments ?? []).filter((item) => item.mimeType.startsWith("image/") && item.dataUrl);
}

export async function listCloudModels(provider: CloudProvider, apiKey: string): Promise<ModelDescriptor[]> {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    await assertOk(response);
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    return (data.data ?? [])
      .map((item) => item.id ?? "")
      .filter(isLikelyOpenAIChatModel)
      .sort()
      .map((id) => ({ id, name: id, provider: "openai" as const }));
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      cache: "no-store",
    });
    await assertOk(response);
    const data = (await response.json()) as { data?: Array<{ id?: string; display_name?: string }> };
    return (data.data ?? []).map((item) => ({
      id: item.id ?? "",
      name: item.display_name || item.id || "Claude",
      provider: "anthropic" as const,
      vision: true,
    })).filter((item) => item.id);
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
    headers: { "x-goog-api-key": apiKey },
    cache: "no-store",
  });
  await assertOk(response);
  const data = (await response.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (data.models ?? [])
    .filter((item) => (item.supportedGenerationMethods ?? []).includes("generateContent"))
    .filter((item) => !((item.name ?? "").toLowerCase().includes("image")))
    .map((item) => {
      const id = (item.name ?? "").replace(/^models\//, "");
      return {
        id,
        name: item.displayName || id,
        description: item.description,
        provider: "gemini" as const,
        vision: true,
      };
    })
    .filter((item) => item.id);
}

function isLikelyOpenAIChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  const generationFamily = /^(?:gpt-(?!image)|chatgpt-|o[1-9](?:-|$))/.test(lower);
  if (!generationFamily) return false;
  const excluded = ["embedding", "moderation", "whisper", "tts", "dall-e", "image", "sora", "transcribe", "realtime", "audio"];
  return !excluded.some((part) => lower.includes(part));
}

export async function streamCloudChat(args: {
  provider: CloudProvider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  if (args.provider === "openai") return streamOpenAI(args);
  if (args.provider === "anthropic") return streamAnthropic(args);
  return streamGemini(args);
}

async function streamOpenAI(args: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const input = args.messages.map((message) => {
    const images = imageAttachments(message);
    if (message.role === "user" && images.length) {
      return {
        role: "user",
        content: [
          { type: "input_text", text: withTextAttachments(message) },
          ...images.map((item) => ({ type: "input_image", image_url: item.dataUrl })),
        ],
      };
    }
    return { role: message.role, content: withTextAttachments(message) };
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      instructions: args.systemPrompt || undefined,
      input,
      stream: true,
      store: false,
    }),
    signal: args.signal,
    cache: "no-store",
  });
  await assertOk(response);
  if (!response.body) throw new Error("OpenAI returned an empty response stream.");

  return mapSseToText(response.body, (event) => {
    const item = event as { type?: string; delta?: string };
    return item.type === "response.output_text.delta" ? item.delta ?? "" : "";
  });
}

async function streamAnthropic(args: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const messages = args.messages.map((message) => {
    if (message.role === "user") {
      const content: unknown[] = [{ type: "text", text: withTextAttachments(message) }];
      for (const image of imageAttachments(message)) {
        const parsed = image.dataUrl ? dataUrlParts(image.dataUrl) : null;
        if (!parsed) continue;
        content.push({
          type: "image",
          source: { type: "base64", media_type: parsed.mimeType, data: parsed.base64 },
        });
      }
      return { role: "user", content };
    }
    return { role: "assistant", content: withTextAttachments(message) };
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 8192,
      system: args.systemPrompt || undefined,
      messages,
      stream: true,
    }),
    signal: args.signal,
    cache: "no-store",
  });
  await assertOk(response);
  if (!response.body) throw new Error("Anthropic returned an empty response stream.");

  return mapSseToText(response.body, (event) => {
    const item = event as { type?: string; delta?: { type?: string; text?: string } };
    return item.type === "content_block_delta" && item.delta?.type === "text_delta"
      ? item.delta.text ?? ""
      : "";
  });
}

async function streamGemini(args: {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const contents = args.messages.map((message) => {
    const parts: unknown[] = [{ text: withTextAttachments(message) }];
    if (message.role === "user") {
      for (const image of imageAttachments(message)) {
        const parsed = image.dataUrl ? dataUrlParts(image.dataUrl) : null;
        if (!parsed) continue;
        parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
      }
    }
    return { role: message.role === "assistant" ? "model" : "user", parts };
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": args.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: args.systemPrompt ? { parts: [{ text: args.systemPrompt }] } : undefined,
      contents,
    }),
    signal: args.signal,
    cache: "no-store",
  });
  await assertOk(response);
  if (!response.body) throw new Error("Gemini returned an empty response stream.");

  return mapSseToText(response.body, (event) => {
    const item = event as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (item.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  });
}

function mapSseToText(
  upstream: ReadableStream<Uint8Array>,
  extract: (event: unknown) => string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of readSseJson(upstream)) {
          const text = extract(event);
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let message = `${response.status} ${response.statusText}`;
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const data = JSON.parse(text) as {
        error?: { message?: string } | string;
        message?: string;
      };
      if (typeof data.error === "string") message = data.error;
      else if (data.error?.message) message = data.error.message;
      else if (data.message) message = data.message;
      else message = text.slice(0, 500);
    } catch {
      message = text.slice(0, 500);
    }
  }
  throw new Error(message);
}
