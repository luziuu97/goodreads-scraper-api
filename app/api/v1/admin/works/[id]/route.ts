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

async function findWorkByIdOrSlug(idOrSlug: string) {
  return prisma.work.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      translations: true,
      titles: true,
      editions: {
        include: {
          covers: true,
          contributors: { include: { author: true } },
          externalIds: true,
        },
      },
      contributors: { include: { author: true } },
      seriesMemberships: { include: { series: true } },
      genres: { include: { genre: true } },
      externalIds: true,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await params;
    const work = await findWorkByIdOrSlug(id);

    if (!work) {
      return NextResponse.json(
        { success: false, error: `Work '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, work });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/works/[id] GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateWork(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateWork(req, params);
}

async function handleUpdateWork(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await paramsPromise;
    const existingWork = await findWorkByIdOrSlug(id);

    if (!existingWork) {
      return NextResponse.json(
        { success: false, error: `Work '${id}' not found.` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      canonicalTitle,
      slug,
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

    const updateData: any = {};

    if (canonicalTitle !== undefined) updateData.canonicalTitle = canonicalTitle;
    if (slug !== undefined) updateData.slug = slugify(slug);
    if (originalLanguage !== undefined) updateData.originalLanguage = originalLanguage;
    if (publicationYear !== undefined)
      updateData.publicationYear = publicationYear !== null ? parseInt(publicationYear, 10) : null;
    if (averageRating !== undefined)
      updateData.averageRating = averageRating !== null ? parseFloat(averageRating) : null;
    if (ratingsCount !== undefined)
      updateData.ratingsCount = ratingsCount !== null ? parseInt(ratingsCount, 10) : null;
    if (reviewsCount !== undefined)
      updateData.reviewsCount = reviewsCount !== null ? parseInt(reviewsCount, 10) : null;
    if (textReviewsCount !== undefined)
      updateData.textReviewsCount = textReviewsCount !== null ? parseInt(textReviewsCount, 10) : null;
    if (popularityScore !== undefined)
      updateData.popularityScore = popularityScore !== null ? parseFloat(popularityScore) : null;

    await prisma.$transaction(async (tx) => {
      // Scalar update
      if (Object.keys(updateData).length > 0) {
        await tx.work.update({
          where: { id: existingWork.id },
          data: updateData,
        });
      }

      // Replace translations if passed
      if (Array.isArray(translations)) {
        await tx.workTranslation.deleteMany({ where: { workId: existingWork.id } });
        if (translations.length > 0) {
          await tx.workTranslation.createMany({
            data: translations.map((t: any) => ({
              workId: existingWork.id,
              language: t.language,
              title: t.title,
              description: t.description ?? null,
            })),
          });
        }
      }

      // Replace titles if passed
      if (Array.isArray(titles)) {
        await tx.workTitle.deleteMany({ where: { workId: existingWork.id } });
        if (titles.length > 0) {
          await tx.workTitle.createMany({
            data: titles.map((t: any) => ({
              workId: existingWork.id,
              language: t.language ?? null,
              title: t.title,
              normalizedTitle: t.normalizedTitle ?? slugify(t.title),
              isPrimary: t.isPrimary ?? false,
              source: t.source ?? null,
            })),
          });
        }
      }

      // Replace contributors if passed
      if (Array.isArray(contributors)) {
        await tx.workContributor.deleteMany({ where: { workId: existingWork.id } });
        if (contributors.length > 0) {
          await tx.workContributor.createMany({
            data: contributors.map((c: any) => ({
              workId: existingWork.id,
              authorId: c.authorId,
              role: c.role ?? "AUTHOR",
              position: c.position ?? 0,
              isPrimary: c.isPrimary ?? false,
            })),
          });
        }
      }

      // Replace genres if passed
      if (Array.isArray(genres)) {
        await tx.genreOnWork.deleteMany({ where: { workId: existingWork.id } });
        if (genres.length > 0) {
          await tx.genreOnWork.createMany({
            data: genres.map((g: any) => ({
              workId: existingWork.id,
              genreId: g.genreId,
              source: g.source ?? "canonical",
              score: g.score ?? null,
            })),
          });
        }
      }

      // Replace externalIds if passed
      if (Array.isArray(externalIds)) {
        await tx.workExternalId.deleteMany({ where: { workId: existingWork.id } });
        if (externalIds.length > 0) {
          await tx.workExternalId.createMany({
            data: externalIds.map((e: any) => ({
              workId: existingWork.id,
              provider: e.provider,
              externalId: String(e.externalId),
            })),
          });
        }
      }
    });

    const updatedWork = await findWorkByIdOrSlug(existingWork.id);

    await clearEndpointCache("search_books");
    await clearEndpointCache("get_book_details");

    return NextResponse.json({ success: true, work: updatedWork });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/works/[id] UPDATE] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await params;
    const existingWork = await prisma.work.findFirst({
      where: {
        OR: [{ id }, { slug: id }],
      },
    });

    if (!existingWork) {
      return NextResponse.json(
        { success: false, error: `Work '${id}' not found.` },
        { status: 404 }
      );
    }

    await prisma.work.delete({ where: { id: existingWork.id } });

    await clearEndpointCache("search_books");
    await clearEndpointCache("get_book_details");

    return NextResponse.json({
      success: true,
      message: `Work '${existingWork.canonicalTitle}' (${existingWork.id}) deleted successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/works/[id] DELETE] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
