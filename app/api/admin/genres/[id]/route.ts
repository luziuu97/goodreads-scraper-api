import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminAccess } from "@/lib/admin-auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateGenre(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateGenre(req, params);
}

async function handleUpdateGenre(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const { id } = await paramsPromise;
    const existingGenre = await prisma.genre.findUnique({ where: { id } });

    if (!existingGenre) {
      return NextResponse.json(
        { success: false, error: `Genre '${id}' not found.` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Field 'name' is required." },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const updatedGenre = await prisma.genre.update({
      where: { id },
      data: { name: trimmedName },
    });

    return NextResponse.json({ success: true, genre: updatedGenre });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/genres/[id] UPDATE] Error:", error);
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
    const existingGenre = await prisma.genre.findUnique({ where: { id } });

    if (!existingGenre) {
      return NextResponse.json(
        { success: false, error: `Genre '${id}' not found.` },
        { status: 404 }
      );
    }

    await prisma.genre.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `Genre '${existingGenre.name}' (${id}) deleted successfully.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/genres/[id] DELETE] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
