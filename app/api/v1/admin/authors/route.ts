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
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ];
    }

    const totalCount = await prisma.author.count({ where });
    const authors = await prisma.author.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: "asc" },
      include: {
        externalIds: true,
        workContributions: {
          include: { work: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      page,
      limit,
      totalCount,
      count: authors.length,
      authors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/authors GET] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAccess(req);
  if (!auth.allowed && auth.response) return auth.response;

  try {
    const body = await req.json();
    const { name, slug: customSlug, externalIds } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'name' is required." },
        { status: 400 }
      );
    }

    const slug = customSlug ? slugify(customSlug) : slugify(name);
    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Valid 'slug' or 'name' required." },
        { status: 400 }
      );
    }

    const existing = await prisma.author.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Author with slug '${slug}' already exists.` },
        { status: 409 }
      );
    }

    const authorData: any = {
      name,
      slug,
    };

    if (Array.isArray(externalIds) && externalIds.length > 0) {
      authorData.externalIds = {
        create: externalIds.map((e: any) => ({
          provider: e.provider,
          externalId: String(e.externalId),
        })),
      };
    }

    const createdAuthor = await prisma.author.create({
      data: authorData,
      include: { externalIds: true },
    });

    return NextResponse.json({ success: true, author: createdAuthor }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN /api/admin/authors POST] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
