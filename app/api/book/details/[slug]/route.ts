import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { getBookDetailsByProvider, parseProvider } from "@/lib/book-providers";
import {
  buildLogicalCacheKey,
  CACHE_TTL_DETAILS,
  getOrSetCached,
  purgeBookCache,
  setCachedResponse,
} from "@/lib/redis-cache";
import { parseLanguageParam } from "@/lib/languages";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

function parseRefreshParam(req: NextRequest): boolean {
  const refreshVal =
    req.nextUrl.searchParams.get("forceRefresh") ??
    req.nextUrl.searchParams.get("refresh") ??
    req.nextUrl.searchParams.get("clean");
  if (!refreshVal) return false;
  const normalized = refreshVal.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

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
    const rawLanguage = req.nextUrl.searchParams.get("language")?.trim() || undefined;
    const language = rawLanguage ? parseLanguageParam(rawLanguage) || undefined : undefined;
    if (rawLanguage && !language) throw new Error("Invalid language parameter. Use a supported ISO code like en or es");

    if (
      editionIdParam &&
      (!Number.isInteger(rawEditionId) || typeof rawEditionId !== "number" || rawEditionId < 0)
    ) {
      throw new Error("Invalid editionId parameter. Must be a non-negative integer");
    }

    const editionId = rawEditionId && rawEditionId > 0 ? rawEditionId : undefined;
    const forceRefresh = parseRefreshParam(req);
    const decodedSlug = decodeURIComponent(slug);

    const cacheKey = buildLogicalCacheKey("get_book_details", {
      provider,
      slug: decodedSlug,
      editionId: editionId ?? "",
      language: language ?? "",
    });

    let responseBody: any;
    let cacheStatus: string;

    if (forceRefresh) {
      await purgeBookCache(decodedSlug);
      responseBody = await getBookDetailsByProvider({
        provider,
        slug: decodedSlug,
        editionId,
        language,
        refresh: true,
      });
      await setCachedResponse(cacheKey, responseBody, CACHE_TTL_DETAILS);
      cacheStatus = "REFRESHED";
    } else {
      const cachedResult = await getOrSetCached(
        cacheKey,
        CACHE_TTL_DETAILS,
        () =>
          getBookDetailsByProvider({
            provider,
            slug: decodedSlug,
            editionId,
            language,
          })
      );
      responseBody = cachedResult.value;
      cacheStatus = cachedResult.cache;
    }

    const apiResponse = NextResponse.json(responseBody);
    apiResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    apiResponse.headers.set("X-Cache", cacheStatus);

    return apiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    const status =
      message.includes("Invalid provider parameter") ||
      message.includes("Invalid editionId parameter") ||
      message.includes("Invalid language parameter") ||
      message.includes("Goodreads HTML provider has been removed")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN") ||
            message.includes("No configured book metadata providers")
          ? 503
          : message.includes("Book not found") ||
              message.includes("No provider could resolve") ||
              message.includes("No Hardcover book found") ||
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
