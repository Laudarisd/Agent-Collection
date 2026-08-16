import { NextResponse } from "next/server";
import { listCloudModels } from "@/lib/cloud/providers";
import type { CloudProvider } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set<CloudProvider>(["openai", "anthropic", "gemini"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provider?: CloudProvider; apiKey?: string };
    if (!body.provider || !PROVIDERS.has(body.provider)) {
      return NextResponse.json({ error: "Unsupported cloud provider." }, { status: 400 });
    }
    if (!body.apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    }

    const models = await listCloudModels(body.provider, body.apiKey.trim());
    return NextResponse.json({ models }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
