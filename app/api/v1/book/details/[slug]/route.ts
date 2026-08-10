import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { getBookDetailsByProvider, parseProvider } from "@/lib/book-providers";
import {
  buildLogicalCacheKey,
  CACHE_TTL_DETAILS,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";

export const revalidate = 3600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await API_CONFIG.publicRateLimit.check(req, "get_book_details");
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

    if (req.nextUrl.searchParams.get("reviews") === "true") {
      const gone = NextResponse.json(
        {
          success: false,
          error:
            "reviews=true is no longer supported. Goodreads HTML review scraping has been removed.",
        },
        { status: 400 }
      );
      gone.headers.set("Cache-Control", "no-store");
      return gone;
    }

    const provider = parseProvider(req.nextUrl.searchParams.get("provider"));
    const editionIdParam = req.nextUrl.searchParams.get("editionId");
    const rawEditionId = editionIdParam ? Number(editionIdParam) : undefined;
    const language = req.nextUrl.searchParams.get("language")?.trim() || undefined;

    if (
      editionIdParam &&
      (!Number.isInteger(rawEditionId) || typeof rawEditionId !== "number" || rawEditionId < 0)
    ) {
      throw new Error("Invalid editionId parameter. Must be a non-negative integer");
    }

    const editionId = rawEditionId && rawEditionId > 0 ? rawEditionId : undefined;

    const cacheKey = buildLogicalCacheKey("get_book_details", {
      provider,
      slug: decodeURIComponent(slug),
      editionId: editionId ?? "",
      language: language ?? "",
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

    const responseBody = await getBookDetailsByProvider({
      provider,
      slug: decodeURIComponent(slug),
      editionId,
      language,
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
      message.includes("Invalid editionId parameter") ||
      message.includes("Goodreads HTML provider has been removed")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN") ||
            message.includes("No configured book metadata providers")
          ? 503
          : message.includes("No Hardcover book found") ||
              message.includes("No Hardcover edition found") ||
              message.includes("does not belong to book")
            ? 404
            : 500;

    console.error(`[API /api/book/details] Error ${status}:`, {
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
