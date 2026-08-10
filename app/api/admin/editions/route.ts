import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminAccess } from "@/lib/admin-auth";
import { clearEndpointCache } from "@/lib/redis-cache";

export async function GET(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const workId = url.searchParams.get("workId");
    const isbn10 = url.searchParams.get("isbn10");
    const isbn13 = url.searchParams.get("isbn13");
    const asin = url.searchParams.get("asin");
    const query = url.searchParams.get("query")?.trim();

    const where: any = {};
    if (workId) where.workId = workId;
    if (isbn10) where.isbn10 = isbn10;
    if (isbn13) where.isbn13 = isbn13;
    if (asin) where.asin = asin;
    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { isbn10: { contains: query, mode: "insensitive" } },
        { isbn13: { contains: query, mode: "insensitive" } },
        { asin: { contains: query, mode: "insensitive" } },
        { publisher: { contains: query, mode: "insensitive" } },
      ];
    }

    const totalCount = await prisma.edition.count({ where });
    const editions = await prisma.edition.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        work: true,
        covers: true,
        contributors: { include: { author: true } },
        externalIds: true,
      },
    });

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      count: editions.length,
      editions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/editions GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const body = await req.json();
    const {
      workId,
      title,
      format,
      language,
      isbn10,
      isbn13,
      asin,
      publisher,
      publicationDate,
      pages,
      isDefault,
      ratingsCount,
      textReviewsCount,
      popularityScore,
      covers,
      contributors,
      externalIds,
    } = body;

    if (!workId || typeof workId !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'workId' is required." },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'title' is required." },
        { status: 400 }
      );
    }

    const workExists = await prisma.work.findUnique({ where: { id: workId } });
    if (!workExists) {
      return NextResponse.json(
        { success: false, error: `Work with ID '${workId}' does not exist.` },
        { status: 404 }
      );
    }

    const editionData: any = {
      workId,
      title,
      format: format || "OTHER",
      language: language ?? null,
      isbn10: isbn10 ?? null,
      isbn13: isbn13 ?? null,
      asin: asin ?? null,
      publisher: publisher ?? null,
      publicationDate: publicationDate ?? null,
      pages: pages ? parseInt(pages, 10) : null,
      isDefault: isDefault ?? false,
      ratingsCount: ratingsCount ? parseInt(ratingsCount, 10) : null,
      textReviewsCount: textReviewsCount ? parseInt(textReviewsCount, 10) : null,
      popularityScore: popularityScore ? parseFloat(popularityScore) : null,
    };

    if (Array.isArray(covers) && covers.length > 0) {
      editionData.covers = {
        create: covers.map((c: any) => ({
          provider: c.provider || "custom",
          url: c.url,
          width: c.width ? parseInt(c.width, 10) : null,
          height: c.height ? parseInt(c.height, 10) : null,
          pixelCount: c.pixelCount ? parseInt(c.pixelCount, 10) : null,
          imageFormat: c.imageFormat || "jpeg",
          isDefault: c.isDefault ?? false,
        })),
      };
    }

    if (Array.isArray(contributors) && contributors.length > 0) {
      editionData.contributors = {
        create: contributors.map((c: any) => ({
          authorId: c.authorId,
          role: c.role ?? "AUTHOR",
          position: c.position ?? 0,
        })),
      };
    }

    if (Array.isArray(externalIds) && externalIds.length > 0) {
      editionData.externalIds = {
        create: externalIds.map((e: any) => ({
          provider: e.provider,
          externalId: String(e.externalId),
        })),
      };
    }

    const createdEdition = await prisma.edition.create({
      data: editionData,
      include: {
        work: true,
        covers: true,
        contributors: { include: { author: true } },
        externalIds: true,
      },
    });

    await clearEndpointCache("get_book_details");
    await clearEndpointCache("get_book_covers");
    await clearEndpointCache("get_book_formats");
    await clearEndpointCache("search_books");

    return NextResponse.json({ success: true, edition: createdEdition }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/editions POST] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
