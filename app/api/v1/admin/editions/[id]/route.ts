import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminAccess } from "@/lib/admin-auth";
import { clearEndpointCache } from "@/lib/redis-cache";

async function findEditionById(id: string) {
  return prisma.edition.findUnique({
    where: { id },
    include: {
      work: true,
      covers: true,
      contributors: { include: { author: true } },
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
    const edition = await findEditionById(id);

    if (!edition) {
      return NextResponse.json(
        { success: false, error: `Edition '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, edition });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/editions/[id] GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateEdition(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateEdition(req, params);
}

async function handleUpdateEdition(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await paramsPromise;
    const existingEdition = await findEditionById(id);

    if (!existingEdition) {
      return NextResponse.json(
        { success: false, error: `Edition '${id}' not found.` },
        { status: 404 }
      );
    }

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

    const updateData: any = {};

    if (workId !== undefined) updateData.workId = workId;
    if (title !== undefined) updateData.title = title;
    if (format !== undefined) updateData.format = format;
    if (language !== undefined) updateData.language = language;
    if (isbn10 !== undefined) updateData.isbn10 = isbn10;
    if (isbn13 !== undefined) updateData.isbn13 = isbn13;
    if (asin !== undefined) updateData.asin = asin;
    if (publisher !== undefined) updateData.publisher = publisher;
    if (publicationDate !== undefined) updateData.publicationDate = publicationDate;
    if (pages !== undefined)
      updateData.pages = pages !== null ? parseInt(pages, 10) : null;
    if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault);
    if (ratingsCount !== undefined)
      updateData.ratingsCount = ratingsCount !== null ? parseInt(ratingsCount, 10) : null;
    if (textReviewsCount !== undefined)
      updateData.textReviewsCount = textReviewsCount !== null ? parseInt(textReviewsCount, 10) : null;
    if (popularityScore !== undefined)
      updateData.popularityScore = popularityScore !== null ? parseFloat(popularityScore) : null;

    await prisma.$transaction(async (tx) => {
      // Scalar updates
      if (Object.keys(updateData).length > 0) {
        await tx.edition.update({
          where: { id: existingEdition.id },
          data: updateData,
        });
      }

      // Replace covers if provided
      if (Array.isArray(covers)) {
        await tx.editionCover.deleteMany({ where: { editionId: existingEdition.id } });
        if (covers.length > 0) {
          await tx.editionCover.createMany({
            data: covers.map((c: any) => ({
              editionId: existingEdition.id,
              provider: c.provider || "custom",
              url: c.url,
              width: c.width ? parseInt(c.width, 10) : null,
              height: c.height ? parseInt(c.height, 10) : null,
              pixelCount: c.pixelCount ? parseInt(c.pixelCount, 10) : null,
              imageFormat: c.imageFormat || "jpeg",
              isDefault: c.isDefault ?? false,
            })),
          });
        }
      }

      // Replace contributors if provided
      if (Array.isArray(contributors)) {
        await tx.editionContributor.deleteMany({ where: { editionId: existingEdition.id } });
        if (contributors.length > 0) {
          await tx.editionContributor.createMany({
            data: contributors.map((c: any) => ({
              editionId: existingEdition.id,
              authorId: c.authorId,
              role: c.role ?? "AUTHOR",
              position: c.position ?? 0,
            })),
          });
        }
      }

      // Replace externalIds if provided
      if (Array.isArray(externalIds)) {
        await tx.editionExternalId.deleteMany({ where: { editionId: existingEdition.id } });
        if (externalIds.length > 0) {
          await tx.editionExternalId.createMany({
            data: externalIds.map((e: any) => ({
              editionId: existingEdition.id,
              provider: e.provider,
              externalId: String(e.externalId),
            })),
          });
        }
      }
    });

    const updatedEdition = await findEditionById(existingEdition.id);

    await clearEndpointCache("get_book_details");
    await clearEndpointCache("get_book_covers");
    await clearEndpointCache("get_book_formats");
    await clearEndpointCache("search_books");

    return NextResponse.json({ success: true, edition: updatedEdition });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/editions/[id] UPDATE] Error:", error);
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
    const existingEdition = await prisma.edition.findUnique({ where: { id } });

    if (!existingEdition) {
      return NextResponse.json(
        { success: false, error: `Edition '${id}' not found.` },
        { status: 404 }
      );
    }

    await prisma.edition.delete({ where: { id } });

    await clearEndpointCache("get_book_details");
    await clearEndpointCache("get_book_covers");
    await clearEndpointCache("get_book_formats");
    await clearEndpointCache("search_books");

    return NextResponse.json({
      success: true,
      message: `Edition '${existingEdition.title}' (${id}) deleted successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/editions/[id] DELETE] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
