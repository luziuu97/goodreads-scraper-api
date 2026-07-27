import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, getHardcoverApiToken } from "@/lib/api-config";
import { fetchHardcoverBookFormats } from "@/lib/providers/hardcover/client";
import {
  buildLogicalCacheKey,
  CACHE_TTL_FORMATS,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";

export const revalidate = 3600;

/**
 * GET /api/book/formats/:slug
 *
 * List editions/formats for a book (Hardcover only — no provider param).
 * Optional filters: language (en, es, original), format (ebook, audiobook, hardcover, paperback, physical).
 * Cached ~30 days (same tier as covers).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await API_CONFIG.publicRateLimit.check(req, "get_book_formats");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    if (!getHardcoverApiToken()) {
      return NextResponse.json(
        {
          success: false,
          error: "HARDCOVER_API_TOKEN is required to list book formats",
        },
        { status: 503 }
      );
    }

    const { slug } = await params;
    const decodedSlug = decodeURIComponent(slug);

    if (!decodedSlug.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Book slug or id is required",
        },
        { status: 400 }
      );
    }

    const language = req.nextUrl.searchParams.get("language");
    const format = req.nextUrl.searchParams.get("format");

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100)
      : 50;

    if (limitParam && (Number.isNaN(parseInt(limitParam, 10)) || parseInt(limitParam, 10) < 1)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid limit parameter. Must be a number between 1 and 100",
        },
        { status: 400 }
      );
    }

    const cacheKey = buildLogicalCacheKey("get_book_formats", {
      slug: decodedSlug,
      limit,
      language: language?.trim() || "",
      format: format?.trim() || "",
    });
    const cachedData = await getCachedResponse(cacheKey);

    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set(
        "Cache-Control",
        "public, s-maxage=86400, stale-while-revalidate=604800"
      );
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }

    const formats = await fetchHardcoverBookFormats(decodedSlug, {
      limit,
      language,
      format,
    });

    const responseBody = {
      success: true as const,
      scrapedURL: formats.scrapedURL,
      book: formats.book,
      formats: formats.formats,
      filters: formats.filters,
      availableLanguages: formats.availableLanguages,
      availableFormats: formats.availableFormats,
      totalEditions: formats.totalEditions,
      totalMatched: formats.totalMatched,
    };

    const apiResponse = NextResponse.json(responseBody);
    apiResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    apiResponse.headers.set("X-Cache", "MISS");

    // Edition metadata changes rarely — formats tier = 30 days.
    await setCachedResponse(cacheKey, responseBody, CACHE_TTL_FORMATS);

    return apiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.includes("Invalid language parameter") ||
      message.includes("Invalid format parameter") ||
      message.includes("Invalid limit parameter")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN")
          ? 503
          : message.includes("No Hardcover book found")
            ? 404
            : 500;

    const errorResponse = NextResponse.json(
      {
        success: false,
        status: "Error - Invalid Query",
        error: message,
      },
      { status }
    );
    errorResponse.headers.set("Cache-Control", "no-store");
    return errorResponse;
  }
}
