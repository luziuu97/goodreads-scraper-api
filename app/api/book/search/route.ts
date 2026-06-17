import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG } from "@/lib/api-config";
import { fetchGoodreadsSearchHtmlWithBrowser } from "@/lib/goodreads-search-browser";
import {
  buildSingleGoodreadsBookSearchResponse,
  parseProvider,
  searchBooksByProvider,
  type NormalizedSearchResponse,
} from "@/lib/book-providers";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
const cheerio = require("cheerio");

export const runtime = "nodejs";

function isBookDetailsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/book\/show\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function hasSearchResults(response: NormalizedSearchResponse): boolean {
  return Array.isArray(response.results.books) && response.results.books.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    // Apply rate limiting
    await API_CONFIG.publicRateLimit.check(req, "search_books");
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

    const provider = parseProvider(searchParams.get("provider"));

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

    const responseData = await searchBooksByProvider({
      provider,
      query: query.trim(),
      limit,
      type,
      goodreadsSearch: async (): Promise<NormalizedSearchResponse> => {
        const encodedQuery = encodeURIComponent(query.trim());
        const scrapeURL = `https://www.goodreads.com/search?q=${encodedQuery}&search_type=books`;

        let finalUrl = scrapeURL;
        let htmlString = "";

        try {
          const browserResult = await fetchGoodreadsSearchHtmlWithBrowser(scrapeURL);
          htmlString = browserResult.html;
          finalUrl = browserResult.finalUrl || scrapeURL;
        } catch (browserError) {
          throw new Error(
            browserError instanceof Error ? browserError.message : "Unknown browser error"
          );
        }

        if (isBookDetailsUrl(finalUrl)) {
          return buildSingleGoodreadsBookSearchResponse(query.trim(), htmlString, finalUrl);
        }

        const $ = cheerio.load(htmlString);
        const totalResultsText = $("h3.searchSubNavContainer").text() || "";
        const totalResultsMatch =
          totalResultsText.match(/about\s+(\d+(?:,\d+)*)\s+results?/i) ||
          totalResultsText.match(/(\d+(?:,\d+)*)\s+results?/i);
        const totalResults = totalResultsMatch
          ? parseInt(totalResultsMatch[1].replace(/,/g, ""), 10)
          : 0;

        const bookRows = $("table.tableList > tbody > tr[itemtype='http://schema.org/Book']");

        const books = bookRows
          .slice(0, limit)
          .map((i: number, el: any) => {
            const $el = $(el);
            const cover = $el.find("td > a > img.bookCover").attr("src") || "";
            const titleLink = $el.find("a.bookTitle");
            const titleSpan = titleLink.find("span[itemprop='name']");
            const title = titleSpan.length > 0
              ? titleSpan.text().trim()
              : titleLink.text().trim();

            let bookURL = titleLink.attr("href") || "";
            if (bookURL && !bookURL.startsWith("http")) {
              bookURL = `https://www.goodreads.com${bookURL}`;
            }

            const bookIdMatch = bookURL.match(/\/book\/show\/(\d+)/);
            const id = bookIdMatch ? bookIdMatch[1] : "";

            const authorSpan = $el.find("span[itemprop='author']");
            const authorNameSpan = authorSpan.find("span[itemprop='name']");
            const author = authorNameSpan.length > 0
              ? authorNameSpan.text().trim()
              : authorSpan.find("a.authorName").text().trim() || "";

            const ratingText = $el.find("span.minirating").text() || "";
            const ratingMatch = ratingText.match(/(\d+\.?\d*)\s+avg\s+rating/i);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

            const pubDateText = $el.find("span.greyText.smallText").text() || "";
            const pubDateMatch =
              pubDateText.match(/published\s+(\w+\s+\d{1,2},\s+\d{4})/i) ||
              pubDateText.match(/published\s+(\d{4})/i);
            const publicationDate = pubDateMatch ? pubDateMatch[1] : "";

            if (!title) {
              return null;
            }

            return {
              id: id || (i + 1).toString(),
              provider: "goodreads" as const,
              title,
              author,
              cover,
              rating: rating || undefined,
              publicationDate: publicationDate || undefined,
              genres: undefined,
            };
          })
          .toArray()
          .filter((book: any) => book !== null && book.title && book.title !== "");

        return {
          success: true,
          provider: "goodreads",
          results: {
            query: query.trim(),
            totalResults: totalResults || books.length,
            books,
          },
        };
      },
    });

    const apiResponse = NextResponse.json(responseData);
    apiResponse.headers.set('X-Cache', 'MISS');

    if (hasSearchResults(responseData)) {
      // Cache only non-empty search results.
      await setCachedResponse(cacheKey, responseData);
    } else {
      apiResponse.headers.set('Cache-Control', 'no-store');
    }

    return apiResponse;

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error";
    const status =
      message.includes("Invalid provider parameter") ? 400 :
      message.includes("HARDCOVER_API_TOKEN") ? 503 :
      message.includes("browser") || message.includes("Goodreads") ? 503 :
      500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
