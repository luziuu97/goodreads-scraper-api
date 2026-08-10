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

async function findSeriesByIdOrSlug(idOrSlug: string) {
  return prisma.series.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      translations: true,
      memberships: {
        include: { work: true },
        orderBy: { position: "asc" },
      },
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
    const series = await findSeriesByIdOrSlug(id);

    if (!series) {
      return NextResponse.json(
        { success: false, error: `Series '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, series });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/series/[id] GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateSeries(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateSeries(req, params);
}

async function handleUpdateSeries(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await paramsPromise;
    const existingSeries = await findSeriesByIdOrSlug(id);

    if (!existingSeries) {
      return NextResponse.json(
        { success: false, error: `Series '${id}' not found.` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      canonicalName,
      slug,
      booksCount,
      translations,
      externalIds,
      memberships,
    } = body;

    const updateData: any = {};
    if (canonicalName !== undefined) updateData.canonicalName = canonicalName;
    if (slug !== undefined) updateData.slug = slugify(slug);
    if (booksCount !== undefined)
      updateData.booksCount = booksCount !== null ? parseInt(booksCount, 10) : null;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.series.update({
          where: { id: existingSeries.id },
          data: updateData,
        });
      }

      if (Array.isArray(translations)) {
        await tx.seriesTranslation.deleteMany({ where: { seriesId: existingSeries.id } });
        if (translations.length > 0) {
          await tx.seriesTranslation.createMany({
            data: translations.map((t: any) => ({
              seriesId: existingSeries.id,
              language: t.language,
              name: t.name,
              description: t.description ?? null,
            })),
          });
        }
      }

      if (Array.isArray(externalIds)) {
        await tx.seriesExternalId.deleteMany({ where: { seriesId: existingSeries.id } });
        if (externalIds.length > 0) {
          await tx.seriesExternalId.createMany({
            data: externalIds.map((e: any) => ({
              seriesId: existingSeries.id,
              provider: e.provider,
              externalId: String(e.externalId),
            })),
          });
        }
      }

      if (Array.isArray(memberships)) {
        await tx.workSeries.deleteMany({ where: { seriesId: existingSeries.id } });
        if (memberships.length > 0) {
          await tx.workSeries.createMany({
            data: memberships.map((m: any) => ({
              seriesId: existingSeries.id,
              workId: m.workId,
              position: m.position ? parseFloat(m.position) : null,
              isPrimary: m.isPrimary ?? false,
            })),
          });
        }
      }
    });

    const updatedSeries = await findSeriesByIdOrSlug(existingSeries.id);

    await clearEndpointCache("search_series");
    await clearEndpointCache("get_series_details");

    return NextResponse.json({ success: true, series: updatedSeries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/series/[id] UPDATE] Error:", error);
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
    const existingSeries = await prisma.series.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!existingSeries) {
      return NextResponse.json(
        { success: false, error: `Series '${id}' not found.` },
        { status: 404 }
      );
    }

    await prisma.series.delete({ where: { id: existingSeries.id } });

    await clearEndpointCache("search_series");
    await clearEndpointCache("get_series_details");

    return NextResponse.json({
      success: true,
      message: `Series '${existingSeries.canonicalName}' (${existingSeries.id}) deleted successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/series/[id] DELETE] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
