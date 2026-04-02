import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, fetchWithConfig } from "@/lib/api-config";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
const cheerio = require("cheerio");

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
  
  // If it's a slug, we need to fetch the user profile to get the ID
  // Try to extract ID from slug format like "123456-username"
  const slugMatch = identifier.match(/^(\d+)/);
  if (slugMatch) {
    return slugMatch[1];
  }
  
  // If we can't parse it, try using it as-is (might work for some formats)
  return identifier;
}

/**
 * Extract number from text (handles commas and other formatting)
 */
function extractNumber(text: string): number | null {
  if (!text) return null;
  const match = text.trim().replace(/,/g, "").match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

/**
 * Extract user rating from stars element
 */
function extractUserRating($stars: any): number | null {
  if (!$stars || $stars.length === 0) return null;
  
  // Try data-rating attribute first
  const dataRating = $stars.attr("data-rating");
  if (dataRating && dataRating !== "null" && dataRating !== "0") {
    const rating = parseInt(dataRating);
    if (!isNaN(rating) && rating > 0) {
      return rating;
    }
  }
  
  // Count active stars
  const activeStars = $stars.find(".star.on").length;
  if (activeStars > 0) {
    return activeStars;
  }
  
  return null;
}

/**
 * Extract value from a field (gets content from .value div, not the label)
 */
function extractFieldValue($field: any): string {
  if (!$field || $field.length === 0) return "";
  
  // Try to get value from .value div first
  const $value = $field.find(".value");
  if ($value.length > 0) {
    return $value.text().trim().replace(/\s+/g, " ");
  }
  
  // Fallback to direct text, but exclude label
  const $label = $field.find("label");
  let text = $field.text().trim();
  if ($label.length > 0) {
    const labelText = $label.text().trim();
    // Remove label text from the beginning
    if (text.startsWith(labelText)) {
      text = text.substring(labelText.length).trim();
    }
  }
  
  return text.replace(/\s+/g, " ");
}

/**
 * Parse date from field, handling "not set" cases
 */
function parseDate($field: any): string | null {
  if (!$field || $field.length === 0) return null;
  
  // Try to get title attribute if available (more accurate date)
  const title = $field.find("span[title]").attr("title");
  if (title) {
    return title;
  }
  
  // Try to get date_started_value or date_read_value
  const dateValue = $field.find(".date_started_value, .date_read_value").text().trim();
  if (dateValue && !dateValue.toLowerCase().includes("not set")) {
    return dateValue;
  }
  
  // Get value from .value div
  const text = extractFieldValue($field);
  if (!text || text.toLowerCase().includes("not set")) {
    return null;
  }
  
  return text || null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { identifier: string } }
) {
  try {
    // Apply rate limiting
    await API_CONFIG.rateLimit.check(req, "get_user_list");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    const { identifier } = await params;
    const { searchParams } = new URL(req.url);
    
    // Get query parameters
    const shelf = searchParams.get("shelf") || "to-read";
    const pageParam = searchParams.get("page");
    const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
    const perPageParam = searchParams.get("per_page");
    const perPage = perPageParam ? Math.max(1, Math.min(100, parseInt(perPageParam))) : 100;
    
    // Check Redis cache
    const cacheKey = generateCacheKey(req, "get_user_list", {
      identifier,
      shelf,
      page: page.toString(),
      per_page: perPage.toString(),
    });
    const cachedData = await getCachedResponse(cacheKey);
    
    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }
    
    // Parse user identifier to get user ID
    const userId = await parseUserIdentifier(identifier);
    
    // Build Goodreads URL with all parameters
    const scrapeURL = `https://www.goodreads.com/review/list/${userId}?utf8=✓&shelf=${encodeURIComponent(shelf)}&per_page=${perPage}&page=${page}`;
    
    const response = await fetchWithConfig(scrapeURL);
    const htmlString = await response.text();
    const $ = cheerio.load(htmlString);
    
    // Check for private profile
    const privateProfile = $("#privateProfile").length > 0;
    if (privateProfile) {
      const privateResponse = NextResponse.json(
        { error: "Private Profile" },
        { status: 403 }
      );
      privateResponse.headers.set("Cache-Control", "no-store");
      return privateResponse;
    }
    
    // Find the books table
    const booksTable = $("#books.table.stacked, table.table.stacked").first();
    
    if (booksTable.length === 0) {
      // No books found or empty shelf
      const responseData = {
        success: true,
        scrapedURL: scrapeURL,
        user: {
          id: userId,
          shelf: shelf,
        },
        pagination: {
          currentPage: page,
          totalPages: null,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        books: [],
        lastScraped: new Date().toISOString(),
      };
      
      await setCachedResponse(cacheKey, responseData);
      const apiResponse = NextResponse.json(responseData);
      apiResponse.headers.set("X-Cache", "MISS");
      return apiResponse;
    }
    
    // Extract books from table rows
    const bookRows = booksTable.find("tr.bookalike.review, tr[id^='review_']");
    
    const books = bookRows
      .map((i: number, el: any) => {
        const $el = $(el);
        
        // Extract review ID from row id attribute
        const reviewIdAttr = $el.attr("id") || "";
        const reviewId = reviewIdAttr.replace("review_", "") || "";
        
        // Cover
        const cover = $el.find("td.field.cover img").attr("src") || "";
        
        // Title
        const $titleLink = $el.find("td.field.title a");
        const title = $titleLink.text().trim();
        const titleUrl = $titleLink.attr("href") || "";
        // Extract book ID from URL
        const bookIdMatch = titleUrl.match(/\/book\/show\/(\d+)/);
        const bookId = bookIdMatch ? bookIdMatch[1] : "";
        
        // Author
        const $authorLink = $el.find("td.field.author a");
        const author = $authorLink.text().trim();
        const authorUrl = $authorLink.attr("href") || "";
        
        // ISBN fields - extract from .value div
        const isbn = extractFieldValue($el.find("td.field.isbn")) || "";
        const isbn13 = extractFieldValue($el.find("td.field.isbn13")) || "";
        const asin = extractFieldValue($el.find("td.field.asin")) || "";
        
        // Pages
        const pagesText = extractFieldValue($el.find("td.field.num_pages"));
        const pages = extractNumber(pagesText);
        
        // Ratings
        const avgRating = extractFieldValue($el.find("td.field.avg_rating")) || "";
        const numRatingsText = extractFieldValue($el.find("td.field.num_ratings"));
        const numRatings = numRatingsText || "";
        
        // Publication dates
        const datePub = extractFieldValue($el.find("td.field.date_pub")) || "";
        const datePubEdition = extractFieldValue($el.find("td.field.date_pub_edition")) || "";
        
        // User rating
        const $stars = $el.find("td.field.rating .stars");
        const userRating = extractUserRating($stars);
        
        // Shelves - extract from .value div
        const shelves: Array<{ name: string; url: string }> = [];
        const $shelvesField = $el.find("td.field.shelves");
        $shelvesField.find(".shelfLink").each((_: number, shelfEl: any) => {
          const $shelf = $(shelfEl);
          const shelfName = $shelf.text().trim();
          const shelfUrl = $shelf.attr("href") || "";
          if (shelfName) {
            shelves.push({
              name: shelfName,
              url: shelfUrl.startsWith("http") ? shelfUrl : `https://www.goodreads.com${shelfUrl}`,
            });
          }
        });
        
        // Dates
        const dateAdded = parseDate($el.find("td.field.date_added"));
        const dateRead = parseDate($el.find("td.field.date_read"));
        const dateStarted = parseDate($el.find("td.field.date_started"));
        
        // Format - extract from .value div
        const formatText = extractFieldValue($el.find("td.field.format"));
        const format = formatText || null;
        
        return {
          reviewId,
          bookId,
          cover,
          title,
          titleUrl: titleUrl.startsWith("http") ? titleUrl : `https://www.goodreads.com${titleUrl}`,
          author,
          authorUrl: authorUrl.startsWith("http") ? authorUrl : `https://www.goodreads.com${authorUrl}`,
          isbn,
          isbn13,
          asin,
          pages,
          avgRating,
          numRatings,
          datePub,
          datePubEdition,
          userRating,
          shelves,
          dateAdded,
          dateRead,
          dateStarted,
          format,
        };
      })
      .toArray();
    
    // Extract pagination information
    let totalPages: number | null = null;
    let hasNextPage = false;
    let hasPreviousPage = false;
    
    // Look for reviewPagination div (primary pagination structure)
    const $reviewPagination = $("#reviewPagination");
    const pageNumbers: number[] = [];
    
    if ($reviewPagination.length > 0) {
      // Extract current page from em.current
      const currentPageText = $reviewPagination.find("em.current").text().trim();
      const currentPageNum = currentPageText.match(/^\d+$/) ? parseInt(currentPageText) : null;
      if (currentPageNum) {
        pageNumbers.push(currentPageNum);
      }
      
      // Extract page numbers from all links (including next/previous)
      $reviewPagination.find("a").each((_: number, el: any) => {
        const $link = $(el);
        const href = $link.attr("href") || "";
        const text = $link.text().trim();
        
        // Extract page number from href
        const hrefMatch = href.match(/[?&]page=(\d+)/);
        if (hrefMatch) {
          const pageNum = parseInt(hrefMatch[1]);
          if (!isNaN(pageNum)) {
            pageNumbers.push(pageNum);
          }
        }
        
        // Extract page number from text if it's just a number (not "next" or "previous")
        const textMatch = text.match(/^\d+$/);
        if (textMatch) {
          const pageNum = parseInt(textMatch[0]);
          if (!isNaN(pageNum)) {
            pageNumbers.push(pageNum);
          }
        }
      });
      
      // Check for next/previous page links
      hasNextPage = $reviewPagination.find("a.next_page").length > 0;
      hasPreviousPage = $reviewPagination.find("a.previous_page, span.previous_page").length > 0 && 
                        $reviewPagination.find("span.previous_page.disabled").length === 0;
    } else {
      // Fallback to generic pagination selectors
      const nextPageLink = $("a.next_page").first();
      const previousPageLink = $("a.previous_page, span.previous_page").first();
      
      hasNextPage = nextPageLink.length > 0 && !nextPageLink.hasClass("disabled");
      hasPreviousPage = previousPageLink.length > 0 && !previousPageLink.hasClass("disabled");
      
      // Extract page numbers from pagination links
      $(".pagination a, .pager a, a[href*='page=']").each((_: number, el: any) => {
        const $link = $(el);
        const href = $link.attr("href") || "";
        const text = $link.text().trim();
        
        const hrefMatch = href.match(/[?&]page=(\d+)/);
        if (hrefMatch) {
          const pageNum = parseInt(hrefMatch[1]);
          if (!isNaN(pageNum)) {
            pageNumbers.push(pageNum);
          }
        }
        
        const textMatch = text.match(/^\d+$/);
        if (textMatch) {
          const pageNum = parseInt(textMatch[0]);
          if (!isNaN(pageNum)) {
            pageNumbers.push(pageNum);
          }
        }
      });
    }
    
    // Try to find "Page X of Y" pattern in any pagination text
    const paginationText = $(".pagination, .pager, .paginationText, #reviewPagination").text();
    const pageOfMatch = paginationText.match(/page\s+(\d+)\s+of\s+(\d+)/i);
    if (pageOfMatch) {
      totalPages = parseInt(pageOfMatch[2]);
    }
    
    // If we have page numbers, use the maximum as a lower bound
    // If there's no next page, the max visible page is likely the total
    if (pageNumbers.length > 0) {
      const maxPage = Math.max(...pageNumbers);
      if (!hasNextPage && maxPage >= page) {
        // We're on the last page, so maxPage is the total
        totalPages = maxPage;
      } else if (hasNextPage) {
        // There are more pages, but we don't know the exact total
        // maxPage is just the highest visible page number
        totalPages = null;
      }
    }
    
    const responseData = {
      success: true,
      scrapedURL: scrapeURL,
      user: {
        id: userId,
        shelf: shelf,
      },
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        hasNextPage: hasNextPage,
        hasPreviousPage: hasPreviousPage,
      },
      books: books,
      lastScraped: new Date().toISOString(),
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

