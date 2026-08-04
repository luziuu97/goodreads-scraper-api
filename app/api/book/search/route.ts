import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import {
  parseProvider,
  searchBooksByProvider,
  type NormalizedSearchResponse,
} from "@/lib/book-providers";
import {
  buildLogicalCacheKey,
  CACHE_TTL_SEARCH,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";

export const runtime = "nodejs";

function hasSearchResults(response: NormalizedSearchResponse): boolean {
  return Array.isArray(response.results.books) && response.results.books.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    await API_CONFIG.publicRateLimit.check(req, "search_books");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    const { searchParams } = new URL(req.url);

    const query = searchParams.get("query");
    if (!query || query.trim() === "") {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    const provider = parseProvider(searchParams.get("provider"));

    const type = searchParams.get("type") || "all";
    const validTypes = ["all", "title", "author", "isbn"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        {
          error: "Invalid type parameter. Valid options: " + validTypes.join(", "),
        },
        { status: 400 }
      );
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50)
      : 10;

    if (limitParam && (isNaN(parseInt(limitParam, 10)) || parseInt(limitParam, 10) < 1)) {
      return NextResponse.json(
        { error: "Invalid limit parameter. Must be a number between 1 and 50" },
        { status: 400 }
      );
    }

    const languageParam = searchParams.get("language");
    const language = languageParam?.trim() || undefined;
    if (language) {
      const code = language.toLowerCase().split(/[-_]/)[0] || "";
      if (!/^[a-z]{2,3}$/.test(code)) {
        return NextResponse.json(
          {
            error:
              "Invalid language parameter. Use an ISO code like en or es",
          },
          { status: 400 }
        );
      }
    }

    const cacheKey = buildLogicalCacheKey("search_books", {
      provider,
      type,
      limit,
      query: query.trim(),
      language: language || "",
    });
    const cachedData = await getCachedResponse(cacheKey);

    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }

    const responseData = await searchBooksByProvider({
      provider,
      query: query.trim(),
      limit,
      type,
      language,
    });

    const apiResponse = NextResponse.json(responseData);
    apiResponse.headers.set("X-Cache", "MISS");

    if (hasSearchResults(responseData)) {
      await setCachedResponse(cacheKey, responseData, CACHE_TTL_SEARCH);
    } else {
      apiResponse.headers.set("Cache-Control", "no-store");
    }

    return apiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const status =
      message.includes("Invalid provider parameter") ||
      message.includes("Goodreads HTML provider has been removed")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN") ||
            message.includes("No configured book metadata providers")
          ? 503
          : 500;

    const errorResponse = NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
    errorResponse.headers.set("Cache-Control", "no-store");
    return errorResponse;
  }
}
