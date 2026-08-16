import { NextResponse } from "next/server";
import { listChanges } from "@/server/db/repositories";
import { apiError, RequestInputError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const brandId = params.get("brandId")?.trim();
    if (!brandId) throw new RequestInputError("brandId is required.");
    const limit = Number(params.get("limit") || 100);
    return NextResponse.json({ changes: await listChanges(brandId, Number.isFinite(limit) ? limit : 100) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load changes.");
  }
}
