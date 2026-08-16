import { NextResponse } from "next/server";
import { buildIntelligenceContext } from "@/server/intelligence/context";
import { apiError, RequestInputError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const brandId = params.get("brandId")?.trim();
    if (!brandId) throw new RequestInputError("brandId is required.");
    const question = (params.get("q") || "").slice(0, 3000);
    const context = await buildIntelligenceContext(brandId, question);
    return NextResponse.json({ context }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to build intelligence context.");
  }
}
