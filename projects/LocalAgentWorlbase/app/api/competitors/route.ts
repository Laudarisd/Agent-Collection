import { NextResponse } from "next/server";
import { createCompetitor, listCompetitors } from "@/server/db/repositories";
import { apiError, cleanText, publicWebsite, requiredText, stringArray, stringRecord, RequestInputError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const brandId = new URL(request.url).searchParams.get("brandId")?.trim();
    if (!brandId) throw new RequestInputError("brandId is required.");
    return NextResponse.json({ competitors: await listCompetitors(brandId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load competitors.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const competitor = await createCompetitor({
      brandId: requiredText(body.brandId, "brandId", 100),
      name: requiredText(body.name, "Competitor name", 200),
      website: publicWebsite(body.website),
      description: cleanText(body.description, 5000),
      industry: cleanText(body.industry, 300),
      country: cleanText(body.country, 200),
      markets: stringArray(body.markets),
      socialProfiles: stringRecord(body.socialProfiles),
    });
    return NextResponse.json({ competitor }, { status: 201 });
  } catch (error) {
    return apiError(error, "Unable to create competitor.");
  }
}
