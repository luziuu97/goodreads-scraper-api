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
    const includeRelations = url.searchParams.get("includeRelations") !== "false";

    const where: any = {};
    if (query) {
      where.OR = [
        { canonicalTitle: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ];
    }

    const totalCount = await prisma.work.count({ where });
    const works = await prisma.work.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: includeRelations
        ? {
            translations: true,
            titles: true,
            editions: {
              include: {
                covers: true,
                contributors: { include: { author: true } },
              },
            },
            contributors: { include: { author: true } },
            seriesMemberships: { include: { series: true } },
            genres: { include: { genre: true } },
            externalIds: true,
          }
        : undefined,
    });

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      count: works.length,
      works,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/works GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const body = await req.json();
    const {
      canonicalTitle,
      slug: customSlug,
      originalLanguage,
      publicationYear,
      averageRating,
      ratingsCount,
      reviewsCount,
      textReviewsCount,
      popularityScore,
      translations,
      titles,
      contributors,
      genres,
      externalIds,
    } = body;

    if (!canonicalTitle || typeof canonicalTitle !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'canonicalTitle' is required." },
        { status: 400 }
      );
    }

    const slug = customSlug ? slugify(customSlug) : slugify(canonicalTitle);
    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Valid 'slug' or 'canonicalTitle' required." },
        { status: 400 }
      );
    }

    const existing = await prisma.work.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Work with slug '${slug}' already exists.` },
        { status: 409 }
      );
    }

    const workData: any = {
      slug,
      canonicalTitle,
      originalLanguage: originalLanguage ?? null,
      publicationYear: publicationYear ? parseInt(publicationYear, 10) : null,
      averageRating: averageRating ? parseFloat(averageRating) : null,
      ratingsCount: ratingsCount ? parseInt(ratingsCount, 10) : null,
      reviewsCount: reviewsCount ? parseInt(reviewsCount, 10) : null,
      textReviewsCount: textReviewsCount ? parseInt(textReviewsCount, 10) : null,
      popularityScore: popularityScore ? parseFloat(popularityScore) : null,
    };

    if (Array.isArray(translations) && translations.length > 0) {
      workData.translations = {
        create: translations.map((t: any) => ({
          language: t.language,
          title: t.title,
          description: t.description ?? null,
        })),
      };
    }

    if (Array.isArray(titles) && titles.length > 0) {
      workData.titles = {
        create: titles.map((t: any) => ({
          language: t.language ?? null,
          title: t.title,
          normalizedTitle: t.normalizedTitle ?? slugify(t.title),
          isPrimary: t.isPrimary ?? false,
          source: t.source ?? null,
        })),
      };
    }

    if (Array.isArray(contributors) && contributors.length > 0) {
      workData.contributors = {
        create: contributors.map((c: any) => ({
          authorId: c.authorId,
          role: c.role ?? "AUTHOR",
          position: c.position ?? 0,
          isPrimary: c.isPrimary ?? false,
        })),
      };
    }

    if (Array.isArray(genres) && genres.length > 0) {
      workData.genres = {
        create: genres.map((g: any) => ({
          genreId: g.genreId,
          source: g.source ?? "canonical",
          score: g.score ?? null,
        })),
      };
    }

    if (Array.isArray(externalIds) && externalIds.length > 0) {
      workData.externalIds = {
        create: externalIds.map((e: any) => ({
          provider: e.provider,
          externalId: String(e.externalId),
        })),
      };
    }

    const createdWork = await prisma.work.create({
      data: workData,
      include: {
        translations: true,
        titles: true,
        contributors: { include: { author: true } },
        genres: { include: { genre: true } },
        externalIds: true,
      },
    });

    await clearEndpointCache("search_books");
    await clearEndpointCache("get_book_details");

    return NextResponse.json({ success: true, work: createdWork }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/works POST] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
