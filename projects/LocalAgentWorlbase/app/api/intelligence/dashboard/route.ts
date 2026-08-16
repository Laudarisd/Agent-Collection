import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/server/db/repositories";
import { apiError, RequestInputError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const brandId = new URL(request.url).searchParams.get("brandId")?.trim();
    if (!brandId) throw new RequestInputError("brandId is required.");
    const summary = await getDashboardSummary(brandId);
    return summary ? NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Brand not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to load intelligence dashboard.");
  }
}
