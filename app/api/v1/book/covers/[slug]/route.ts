import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { getBookCoversByProvider, parseProvider } from "@/lib/book-providers";
import {
  buildLogicalCacheKey,
  CACHE_TTL_COVER,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";

export const revalidate = 3600;

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
  if (value === null || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("Invalid onlyWithCover parameter. Use true or false");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await API_CONFIG.publicRateLimit.check(req, "get_book_covers");
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

    const provider = parseProvider(req.nextUrl.searchParams.get("provider"));
    const onlyWithCover = parseBooleanParam(
      req.nextUrl.searchParams.get("onlyWithCover"),
      true
    );

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100)
      : 50;

    if (limitParam && (Number.isNaN(parseInt(limitParam, 10)) || parseInt(limitParam, 10) < 1 || parseInt(limitParam, 10) > 100)) {
      return NextResponse.json(
        { success: false, error: "Invalid limit parameter. Must be a number between 1 and 100" },
        { status: 400 }
      );
    }

    const cacheKey = buildLogicalCacheKey("get_book_covers", {
      provider,
      slug: decodedSlug,
      limit,
      onlyWithCover: onlyWithCover ? "1" : "0",
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

    const responseBody = await getBookCoversByProvider({
      provider,
      slug: decodedSlug,
      limit,
      onlyWithCover,
    });

    const apiResponse = NextResponse.json(responseBody);
    apiResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    apiResponse.headers.set("X-Cache", "MISS");

    await setCachedResponse(cacheKey, responseBody, CACHE_TTL_COVER);

    return apiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    const status =
      message.includes("Invalid provider parameter") ||
      message.includes("Invalid onlyWithCover parameter") ||
      message.includes("Invalid limit parameter") ||
      message.includes("Goodreads HTML provider has been removed")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN") ||
            message.includes("No configured book metadata providers")
          ? 503
          : message.includes("No Hardcover book found")
            ? 404
            : 500;

    console.error(`[API /api/book/covers] Error ${status}:`, {
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
