import { NextResponse } from "next/server";
import { createBrand, listBrands } from "@/server/db/repositories";
import { apiError, cleanText, publicWebsite, requiredText, stringArray, stringRecord } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ brands: await listBrands() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Unable to load brands.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const brand = await createBrand({
      name: requiredText(body.name, "Brand name", 200),
      website: publicWebsite(body.website),
      industry: cleanText(body.industry, 300),
      description: cleanText(body.description, 5000),
      services: stringArray(body.services),
      targetCustomers: stringArray(body.targetCustomers),
      countries: stringArray(body.countries),
      languages: stringArray(body.languages),
      keywords: stringArray(body.keywords, 100),
      socialProfiles: stringRecord(body.socialProfiles),
      positioning: cleanText(body.positioning, 2000),
      valueProposition: cleanText(body.valueProposition, 2000),
    });
    return NextResponse.json({ brand }, { status: 201 });
  } catch (error) {
    return apiError(error, "Unable to create brand.");
  }
}
