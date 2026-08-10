import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminAccess } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const genres = await prisma.genre.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { works: true } },
      },
    });

    return NextResponse.json({
      success: true,
      count: genres.length,
      genres,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/genres GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Field 'name' is required." },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const existing = await prisma.genre.findUnique({ where: { name: trimmedName } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Genre '${trimmedName}' already exists.` },
        { status: 409 }
      );
    }

    const createdGenre = await prisma.genre.create({
      data: { name: trimmedName },
    });

    return NextResponse.json({ success: true, genre: createdGenre }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/genres POST] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
