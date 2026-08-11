import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { getSeriesDetailsByProvider, parseProvider } from "@/lib/book-providers";
import {
  buildLogicalCacheKey,
  CACHE_TTL_DETAILS,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";
import { parseLanguageParam } from "@/lib/languages";

export const revalidate = 3600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await API_CONFIG.publicRateLimit.check(req, "get_series_details");
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
          error: "Series slug or id is required",
        },
        { status: 400 }
      );
    }

    const provider = parseProvider(req.nextUrl.searchParams.get("provider"));

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100)
      : 50;

    if (limitParam && (Number.isNaN(parseInt(limitParam, 10)) || parseInt(limitParam, 10) < 1 || parseInt(limitParam, 10) > 100)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid limit parameter. Must be a number between 1 and 100",
        },
        { status: 400 }
      );
    }

    const offsetParam = req.nextUrl.searchParams.get("offset");
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (offsetParam && (Number.isNaN(offset) || offset < 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid offset parameter. Must be a non-negative integer",
        },
        { status: 400 }
      );
    }

    const rawLanguage = req.nextUrl.searchParams.get("language") || "original";
    const language = rawLanguage === "original" ? "original" : parseLanguageParam(rawLanguage);
    if (!language) throw new Error("Invalid language parameter. Use original or a supported ISO code like en or es");
    const format = req.nextUrl.searchParams.get("format") || undefined;

    const cacheKey = buildLogicalCacheKey("get_series_details", {
      provider,
      slug: decodedSlug,
      limit,
      offset,
      language,
      format: format || "",
    }, "v1");
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

    const responseBody = await getSeriesDetailsByProvider({
      provider,
      slug: decodedSlug,
      limit,
      offset,
      language,
      format,
    });

    const apiResponse = NextResponse.json(responseBody);
    apiResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    apiResponse.headers.set("X-Cache", "MISS");

    await setCachedResponse(cacheKey, responseBody, CACHE_TTL_DETAILS);

    return apiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    const status =
      message.includes("Invalid provider parameter") ||
      message.includes("Invalid limit parameter") ||
      message.includes("Invalid offset parameter") ||
      message.includes("Invalid language parameter") ||
      message.includes("Invalid format parameter") ||
      message.includes("Goodreads HTML provider has been removed")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN") ||
            message.includes("No configured book metadata providers")
          ? 503
          : message.includes("No Hardcover series found") || message.includes("Series not found")
            ? 404
            : 500;

    console.error(`[API /api/series/details] Error ${status}:`, {
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
