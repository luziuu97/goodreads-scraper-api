import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminAccess } from "@/lib/admin-auth";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function findAuthorByIdOrSlug(idOrSlug: string) {
  return prisma.author.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      externalIds: true,
      workContributions: { include: { work: true } },
      editionContributions: { include: { edition: true } },
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
    const author = await findAuthorByIdOrSlug(id);

    if (!author) {
      return NextResponse.json(
        { success: false, error: `Author '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, author });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/authors/[id] GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateAuthor(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateAuthor(req, params);
}

async function handleUpdateAuthor(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await paramsPromise;
    const existingAuthor = await findAuthorByIdOrSlug(id);

    if (!existingAuthor) {
      return NextResponse.json(
        { success: false, error: `Author '${id}' not found.` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { name, slug, externalIds } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slugify(slug);

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.author.update({
          where: { id: existingAuthor.id },
          data: updateData,
        });
      }

      if (Array.isArray(externalIds)) {
        await tx.authorExternalId.deleteMany({ where: { authorId: existingAuthor.id } });
        if (externalIds.length > 0) {
          await tx.authorExternalId.createMany({
            data: externalIds.map((e: any) => ({
              authorId: existingAuthor.id,
              provider: e.provider,
              externalId: String(e.externalId),
            })),
          });
        }
      }
    });

    const updatedAuthor = await findAuthorByIdOrSlug(existingAuthor.id);

    return NextResponse.json({ success: true, author: updatedAuthor });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/authors/[id] UPDATE] Error:", error);
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
    const existingAuthor = await prisma.author.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!existingAuthor) {
      return NextResponse.json(
        { success: false, error: `Author '${id}' not found.` },
        { status: 404 }
      );
    }

    await prisma.author.delete({ where: { id: existingAuthor.id } });

    return NextResponse.json({
      success: true,
      message: `Author '${existingAuthor.name}' (${existingAuthor.id}) deleted successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/authors/[id] DELETE] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
