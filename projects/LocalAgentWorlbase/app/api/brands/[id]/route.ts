import { NextResponse } from "next/server";
import { deleteBrand, getBrand, updateBrand } from "@/server/db/repositories";
import { apiError, cleanText, publicWebsite, requiredText, stringArray, stringRecord } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    const brand = await getBrand(id);
    return brand ? NextResponse.json({ brand }) : NextResponse.json({ error: "Brand not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to load brand.");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const brand = await updateBrand(id, {
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
    return brand ? NextResponse.json({ brand }) : NextResponse.json({ error: "Brand not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to update brand.");
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    return await deleteBrand(id)
      ? new Response(null, { status: 204 })
      : NextResponse.json({ error: "Brand not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to delete brand.");
  }
}
