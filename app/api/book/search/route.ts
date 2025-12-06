import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, fetchWithConfig } from "@/lib/api-config";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
const cheerio = require("cheerio");

export async function GET(req: NextRequest) {
  try {
    // Apply rate limiting
    await API_CONFIG.rateLimit.check(req, "search_books");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set('Cache-Control', 'no-store');
    return rateLimitResponse;
  }

  try {
    const { searchParams } = new URL(req.url);
    
    // Check Redis cache
    const cacheKey = generateCacheKey(req, "search_books");
    const cachedData = await getCachedResponse(cacheKey);
    
    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set('X-Cache', 'HIT');
      return cachedResponse;
    }
    
    // Get and validate query parameter
    const query = searchParams.get("query");
    if (!query || query.trim() === "") {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    // Get and validate type parameter
    const type = searchParams.get("type") || "all";
    const validTypes = ["all", "title", "author", "isbn"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { 
          error: "Invalid type parameter. Valid options: " + validTypes.join(", ") 
        },
        { status: 400 }
      );
    }

    // Get and validate limit parameter
    const limitParam = searchParams.get("limit");
    const limit = limitParam 
      ? Math.min(Math.max(parseInt(limitParam), 1), 50)
      : 10;
    
    if (limitParam && (isNaN(parseInt(limitParam)) || parseInt(limitParam) < 1)) {
      return NextResponse.json(
        { error: "Invalid limit parameter. Must be a number between 1 and 50" },
        { status: 400 }
      );
    }

    // Construct Goodreads search URL
    const encodedQuery = encodeURIComponent(query.trim());
    const scrapeURL = `https://www.goodreads.com/search?q=${encodedQuery}&search_type=books`;

    const response = await fetchWithConfig(scrapeURL);
    const htmlString = await response.text();
    const $ = cheerio.load(htmlString);

    // Extract total results count if available
    // Format: "Page 1 of about 584447 results (0.10 seconds)"
    const totalResultsText = $("h3.searchSubNavContainer").text() || "";
    const totalResultsMatch = totalResultsText.match(/about\s+(\d+(?:,\d+)*)\s+results?/i) ||
                             totalResultsText.match(/(\d+(?:,\d+)*)\s+results?/i);
    const totalResults = totalResultsMatch 
      ? parseInt(totalResultsMatch[1].replace(/,/g, "")) 
      : 0;

    // Extract book results from the search results table
    // Goodreads uses: table.tableList > tbody > tr[itemtype='http://schema.org/Book']
    const bookRows = $("table.tableList > tbody > tr[itemtype='http://schema.org/Book']");

    const books = bookRows
      .slice(0, limit)
      .map((i: number, el: any) => {
        const $el = $(el);
        
        // Extract book cover image
        const cover = $el.find("td > a > img.bookCover").attr("src") || "";

        // Extract book title - title is in <a class="bookTitle"><span itemprop="name">Title</span></a>
        const titleLink = $el.find("a.bookTitle");
        const titleSpan = titleLink.find("span[itemprop='name']");
        const title = titleSpan.length > 0 
          ? titleSpan.text().trim() 
          : titleLink.text().trim();
        
        let bookURL = titleLink.attr("href") || "";
        
        // Ensure URL is absolute
        if (bookURL && !bookURL.startsWith("http")) {
          bookURL = `https://www.goodreads.com${bookURL}`;
        }
        
        // Extract book ID from URL (format: /book/show/123456-title)
        const bookIdMatch = bookURL.match(/\/book\/show\/(\d+)/);
        const id = bookIdMatch ? bookIdMatch[1] : "";

        // Extract author name - author is in <span itemprop="author"><div class="authorName__container"><a class="authorName"><span itemprop="name">Author</span></a></div></span>
        const authorSpan = $el.find("span[itemprop='author']");
        const authorNameSpan = authorSpan.find("span[itemprop='name']");
        const author = authorNameSpan.length > 0
          ? authorNameSpan.text().trim()
          : authorSpan.find("a.authorName").text().trim() || "";

        // Extract rating - format: "3.81 avg rating — 181,917 ratings"
        const ratingText = $el.find("span.minirating").text() || "";
        const ratingMatch = ratingText.match(/(\d+\.?\d*)\s+avg\s+rating/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // Extract publication date - format: "published 2019" or "published May 2, 2023"
        const pubDateText = $el.find("span.greyText.smallText").text() || "";
        // Try to match "published YYYY" or "published Month Day, YYYY"
        const pubDateMatch = pubDateText.match(/published\s+(\w+\s+\d{1,2},\s+\d{4})/i) ||
                           pubDateText.match(/published\s+(\d{4})/i);
        const publicationDate = pubDateMatch ? pubDateMatch[1] : "";

        // Extract genres - genres are not typically shown in search results, but we can try
        // Note: Search results don't show genres, so this will likely be empty
        const genres: string[] = [];

        // Only return if we have at least a title
        if (!title || title === "") {
          return null;
        }

        return {
          id: id || (i + 1).toString(),
          title: title,
          author: author,
          cover: cover,
          rating: rating || undefined,
          publicationDate: publicationDate || undefined,
          genres: genres.length > 0 ? genres : undefined,
        };
      })
      .toArray()
      .filter((book: any) => book !== null && book.title && book.title !== ""); // Filter out null/empty results

    const responseData = {
      success: true,
      results: {
        query: query.trim(),
        totalResults: totalResults || books.length,
        books: books,
      },
    };

    // Cache response in Redis for 4 hours
    await setCachedResponse(cacheKey, responseData);

    const apiResponse = NextResponse.json(responseData);
    apiResponse.headers.set('X-Cache', 'MISS');
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
    errorResponse.headers.set('Cache-Control', 'no-store');
    return errorResponse;
  }
}

