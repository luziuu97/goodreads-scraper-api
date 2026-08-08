import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, getHardcoverApiToken } from "@/lib/api-config";
import { fetchHardcoverBookFormats } from "@/lib/providers/hardcover/client";
import { findCanonicalWork } from "@/lib/canonical/reader";
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

    if (language && language !== "original" && !/^[a-z]{2,3}$/i.test(language.trim())) {
      throw new Error("Invalid language parameter. Use an ISO code like en or es");
    }
    if (
      format &&
      !["ebook", "audiobook", "hardcover", "paperback", "physical"].includes(
        format.trim().toLowerCase()
      )
    ) {
      throw new Error(
        "Invalid format parameter. Use ebook, audiobook, hardcover, paperback, or physical"
      );
    }

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

    // Postgres sits between Redis and Hardcover. Stored editions can satisfy
    // this endpoint even when the external provider is unavailable.
    try {
      const localWork = await findCanonicalWork(decodedSlug);
      if (localWork && localWork.editions.length > 0) {
        const requestedLanguage = language?.trim().toLowerCase() || null;
        const requestedFormat = format?.trim().toUpperCase() || null;
        const formats = localWork.editions
          .filter((edition) => {
            const languageMatches =
              !requestedLanguage ||
              requestedLanguage === "original" ||
              edition.language.toLowerCase() === requestedLanguage;
            const formatMatches =
              !requestedFormat ||
              edition.format === requestedFormat ||
              (requestedFormat === "PHYSICAL" &&
                ["HARDCOVER", "PAPERBACK"].includes(edition.format));
            return languageMatches && formatMatches;
          })
          .slice(0, limit)
          .map((edition, index) => {
            const cover =
              edition.covers.find((item) => item.isDefault) || edition.covers[0];
            return {
              editionId: index + 1,
              title: edition.title,
              format: edition.format.toLowerCase(),
              formatLabel: edition.format,
              editionFormat: edition.format,
              readingFormat: null,
              language: edition.language,
              languageCode: edition.language,
              country: null,
              countryCode: null,
              isbn: edition.isbn13,
              isbn10: edition.isbn10,
              asin: edition.asin,
              pages: edition.pages,
              publicationDate: edition.publicationDate,
              publisher: edition.publisher,
              cover: cover?.url || "",
              usersCount: null,
            };
          });

        const responseBody = {
          success: true as const,
          scrapedURL: `canonical://work/${localWork.id}`,
          book: { id: localWork.id, slug: localWork.slug, title: localWork.canonicalTitle },
          formats,
          filters: {
            language: requestedLanguage,
            resolvedLanguage: requestedLanguage === "original" ? localWork.originalLanguage : requestedLanguage,
            originalLanguage: localWork.originalLanguage,
            format: requestedFormat?.toLowerCase() || null,
          },
          availableLanguages: Array.from(new Set(localWork.editions.map((edition) => edition.language)))
            .sort()
            .map((code) => ({ code, name: code })),
          availableFormats: Array.from(new Set(localWork.editions.map((edition) => edition.format.toLowerCase()))).sort(),
          totalEditions: localWork.editions.length,
          totalMatched: formats.length,
        };
        await setCachedResponse(cacheKey, responseBody, CACHE_TTL_FORMATS);
        const databaseResponse = NextResponse.json(responseBody);
        databaseResponse.headers.set("X-Cache", "DATABASE");
        return databaseResponse;
      }
    } catch (error) {
      console.error("Canonical format lookup failed; falling back to Hardcover:", error);
    }

    if (!getHardcoverApiToken()) {
      return NextResponse.json(
        {
          success: false,
          error: "HARDCOVER_API_TOKEN is required to list book formats",
        },
        { status: 503 }
      );
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
    const stack = error instanceof Error ? error.stack : undefined;
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

    console.error(`[API /api/book/formats] Error ${status}:`, {
      url: req.url,
      error: message,
      stack,
    });

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
