import { NextResponse } from "next/server";
import { deleteCompetitor, getCompetitor, updateCompetitor } from "@/server/db/repositories";
import { apiError, cleanText, publicWebsite, requiredText, stringArray, stringRecord } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    const competitor = await getCompetitor(id);
    return competitor ? NextResponse.json({ competitor }) : NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to load competitor.");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const competitor = await updateCompetitor(id, {
      brandId: requiredText(body.brandId, "brandId", 100),
      name: requiredText(body.name, "Competitor name", 200),
      website: publicWebsite(body.website),
      description: cleanText(body.description, 5000),
      industry: cleanText(body.industry, 300),
      country: cleanText(body.country, 200),
      markets: stringArray(body.markets),
      socialProfiles: stringRecord(body.socialProfiles),
    });
    return competitor ? NextResponse.json({ competitor }) : NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to update competitor.");
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    return await deleteCompetitor(id)
      ? new Response(null, { status: 204 })
      : NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  } catch (error) {
    return apiError(error, "Unable to delete competitor.");
  }
}
