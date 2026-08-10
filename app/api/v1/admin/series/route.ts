import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminAccess } from "@/lib/admin-auth";
import { clearEndpointCache } from "@/lib/redis-cache";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const query = url.searchParams.get("query")?.trim();

    const where: any = {};
    if (query) {
      where.OR = [
        { canonicalName: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ];
    }

    const totalCount = await prisma.series.count({ where });
    const seriesList = await prisma.series.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { canonicalName: "asc" },
      include: {
        translations: true,
        memberships: {
          include: { work: true },
          orderBy: { position: "asc" },
        },
        externalIds: true,
      },
    });

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      count: seriesList.length,
      series: seriesList,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/series GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const body = await req.json();
    const {
      canonicalName,
      slug: customSlug,
      booksCount,
      translations,
      externalIds,
      memberships,
    } = body;

    if (!canonicalName || typeof canonicalName !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'canonicalName' is required." },
        { status: 400 }
      );
    }

    const slug = customSlug ? slugify(customSlug) : slugify(canonicalName);
    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Valid 'slug' or 'canonicalName' required." },
        { status: 400 }
      );
    }

    const existing = await prisma.series.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Series with slug '${slug}' already exists.` },
        { status: 409 }
      );
    }

    const seriesData: any = {
      canonicalName,
      slug,
      booksCount: booksCount ? parseInt(booksCount, 10) : null,
    };

    if (Array.isArray(translations) && translations.length > 0) {
      seriesData.translations = {
        create: translations.map((t: any) => ({
          language: t.language,
          name: t.name,
          description: t.description ?? null,
        })),
      };
    }

    if (Array.isArray(externalIds) && externalIds.length > 0) {
      seriesData.externalIds = {
        create: externalIds.map((e: any) => ({
          provider: e.provider,
          externalId: String(e.externalId),
        })),
      };
    }

    if (Array.isArray(memberships) && memberships.length > 0) {
      seriesData.memberships = {
        create: memberships.map((m: any) => ({
          workId: m.workId,
          position: m.position ? parseFloat(m.position) : null,
          isPrimary: m.isPrimary ?? false,
        })),
      };
    }

    const createdSeries = await prisma.series.create({
      data: seriesData,
      include: {
        translations: true,
        memberships: { include: { work: true } },
        externalIds: true,
      },
    });

    await clearEndpointCache("search_series");
    await clearEndpointCache("get_series_details");

    return NextResponse.json({ success: true, series: createdSeries }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/series POST] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
