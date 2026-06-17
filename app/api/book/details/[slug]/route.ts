import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { getBookDetailsByProvider, parseProvider } from "@/lib/book-providers";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";

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
    const provider = parseProvider(req.nextUrl.searchParams.get("provider"));
    const editionIdParam = req.nextUrl.searchParams.get("editionId");
    const editionId = editionIdParam ? Number(editionIdParam) : undefined;

    if (
      editionIdParam &&
      (!Number.isInteger(editionId) || typeof editionId !== "number" || editionId < 1)
    ) {
      throw new Error("Invalid editionId parameter. Must be a positive integer");
    }

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

    const responseBody = await getBookDetailsByProvider({
      provider,
      slug,
      includeReviews,
      editionId,
    });

    const apiResponse = NextResponse.json(responseBody);
    apiResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    apiResponse.headers.set("X-Cache", "MISS");

    await setCachedResponse(cacheKey, responseBody);

    return apiResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.includes("Invalid provider parameter") ||
      message.includes("Invalid editionId parameter") ||
      message.includes("reviews=true option is only supported")
        ? 400
        : message.includes("HARDCOVER_API_TOKEN")
          ? 503
          : 404;

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
