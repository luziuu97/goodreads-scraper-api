import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, fetchWithConfig } from "@/lib/api-config";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
import { parseYear2025 } from "@/data/api-endpoint/parse-year-2025";

/**
 * Parse user identifier to extract user ID
 * Supports: numeric ID, slug, or full URL
 */
async function parseUserIdentifier(identifier: string): Promise<string> {
  // If it's a full URL
  if (identifier.startsWith("http")) {
    // Extract from /review/list/{userId} or /user/show/{userId}
    const reviewListMatch = identifier.match(/\/review\/list\/(\d+)/);
    if (reviewListMatch) {
      return reviewListMatch[1];
    }
    
    const userShowMatch = identifier.match(/\/user\/show\/(\d+)/);
    if (userShowMatch) {
      return userShowMatch[1];
    }
    
    // Try to extract from any numeric part in the URL
    const numericMatch = identifier.match(/(\d+)/);
    if (numericMatch) {
      return numericMatch[1];
    }
  }
  
  // If it's numeric, treat as user ID
  if (/^\d+$/.test(identifier)) {
    return identifier;
  }
  
  // If it's a slug, extract ID from slug format like "123456-username"
  const slugMatch = identifier.match(/^(\d+)/);
  if (slugMatch) {
    return slugMatch[1];
  }
  
  // If we can't parse it, try using it as-is
  return identifier;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; year: string } }
) {
  try {
    // Apply rate limiting
    await API_CONFIG.rateLimit.check(req, "get_user_year_in_review");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    const { slug, year } = await params;
    
    // Validate year parameter
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > new Date().getFullYear() + 1) {
      return NextResponse.json(
        { error: "Invalid year parameter. Must be between 2000 and current year + 1" },
        { status: 400 }
      );
    }
    
    // Check Redis cache
    const cacheKey = generateCacheKey(req, "get_user_year_in_review", {
      slug,
      year: year.toString(),
    });
    const cachedData = await getCachedResponse(cacheKey);
    
    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }
    
    // Parse user identifier to get user ID
    const userId = await parseUserIdentifier(slug);
    
    // Check if year is supported
    if (yearNum !== 2025) {
      const wipResponse = NextResponse.json(
        {
          success: true,
          message: "WIP",
          year: yearNum,
        },
        { status: 200 }
      );
      wipResponse.headers.set("Cache-Control", "no-store");
      return wipResponse;
    }
    
    // Build Goodreads URL for the Year in Books page
    // URL format: /user/year_in_books/{year}/{userId}
    const scrapeURL = `https://www.goodreads.com/user/year_in_books/${yearNum}/${userId}`;
    
    const response = await fetchWithConfig(scrapeURL);
    const htmlString = await response.text();
    
    // Parse the HTML using year-specific parser
    const parseResult = parseYear2025(htmlString, yearNum, userId);
    
    // Handle parsing errors (e.g., private profile)
    if (parseResult.error) {
      const errorResponse = NextResponse.json(
        { error: parseResult.error },
        { status: parseResult.status || 403 }
      );
      errorResponse.headers.set("Cache-Control", "no-store");
      return errorResponse;
    }
    
    const yearInReview = parseResult.readingChallenge;
    
    const lastScraped = new Date().toISOString();
    
    const responseData = {
      success: true,
      scrapedURL: scrapeURL,
      yearInReview: yearInReview,
      lastScraped,
    };
    
    // Cache response in Redis for 4 hours
    await setCachedResponse(cacheKey, responseData);
    
    const apiResponse = NextResponse.json(responseData);
    apiResponse.headers.set("X-Cache", "MISS");
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


