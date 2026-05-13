import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
import { scrapeBookDetails } from "@/lib/goodreads-book-details";

export const revalidate = 3600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await API_CONFIG.publicRateLimit.check(req, "get_book_details");
    console.log("Rate limit applied");
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
    const includeReviews = req.nextUrl.searchParams.get("reviews") === "true";

    const cacheKey = generateCacheKey(req, "get_book_details", { slug });
    const cachedData = await getCachedResponse(cacheKey);

    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=86400"
      );
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }

    const { scrapedURL, book } = await scrapeBookDetails(slug, includeReviews);
    const responseBody = {
      success: true,
      scrapedURL,
      book,
    };

    const apiResponse = NextResponse.json(responseBody);
    apiResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    apiResponse.headers.set("X-Cache", "MISS");

    await setCachedResponse(cacheKey, responseBody);

    return apiResponse;
  } catch (error) {
    const errorResponse = NextResponse.json(
      {
        success: false,
        status: "Error - Invalid Query",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 404 }
    );
    errorResponse.headers.set("Cache-Control", "no-store");
    return errorResponse;
  }
}
