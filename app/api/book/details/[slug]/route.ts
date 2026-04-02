import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, fetchWithConfig } from "@/lib/api-config";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
const cheerio = require("cheerio");

const MONTH_TO_MM: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** Parses Goodreads publication strings (e.g. "First published July 2, 2024") to ISO date YYYY-MM-DD. */
function normalizePublicationDate(raw: string): string | null {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  text = text.replace(/(.+?)\1+/g, "$1").trim();

  const month = `(January|February|March|April|May|June|July|August|September|October|November|December)`;
  const dayYear = `${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`;

  const firstPub = new RegExp(`first\\.?\\s+published\\s+${dayYear}`, "i");
  let m = text.match(firstPub);
  if (m) {
    const iso = monthDayYearToIso(m[1], m[2], m[3]);
    if (iso) return iso;
  }

  const anyFull = new RegExp(dayYear, "gi");
  m = anyFull.exec(text);
  if (m) {
    const iso = monthDayYearToIso(m[1], m[2], m[3]);
    if (iso) return iso;
  }

  const yearOnly = text.match(/\b(1[6789]\d{2}|20\d{2})\b/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;

  return null;
}

function monthDayYearToIso(
  monthName: string,
  dayStr: string,
  yearStr: string
): string | null {
  const mm = MONTH_TO_MM[monthName.toLowerCase()];
  if (!mm) return null;
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(day) || !Number.isFinite(year) || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${mm}-${String(day).padStart(2, "0")}`;
}

function extractLegacyIdFromSlug(slug: string): string | null {
  const m = /^(\d+)/.exec(slug);
  return m ? m[1] : null;
}

function digitsOnly(s: string | null | undefined): string | null {
  if (s == null || s === "") return null;
  const d = String(s).replace(/\D/g, "");
  return d || null;
}

type ApolloBookDetails = {
  isbn: string | null;
  isbn10: string | null;
  asin: string | null;
  language: string | null;
  publishDate: string | null;
  publishedBy: string | null;
  pages: number | null;
  type: string | null;
};

/** Reads `__NEXT_DATA__` Apollo cache for structured BookDetails (ISBN, ASIN, format, etc.). */
function parseApolloBookDetails(
  html: string,
  legacyId: string
): ApolloBookDetails | null {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const apolloState = (data as { props?: { pageProps?: { apolloState?: Record<string, unknown> } } })
    ?.props?.pageProps?.apolloState;
  if (!apolloState || typeof apolloState !== "object") return null;

  const book = findBookInApolloState(apolloState, legacyId);
  if (!book || typeof book !== "object") return null;

  const details = (book as { details?: Record<string, unknown> }).details;
  if (!details || typeof details !== "object") return null;
  if ((details as { __typename?: string }).__typename !== "BookDetails") return null;

  const isbn13 = digitsOnly(details.isbn13 as string | undefined);
  const isbn10Raw = digitsOnly(details.isbn as string | undefined);
  const isbn10 =
    isbn10Raw && isbn10Raw.length === 10
      ? isbn10Raw
      : null;

  const publicationTime = details.publicationTime;
  let publishDate: string | null = null;
  if (typeof publicationTime === "number" && Number.isFinite(publicationTime)) {
    publishDate = new Date(publicationTime).toISOString().slice(0, 10);
  }

  const numPages = details.numPages;
  const pages =
    typeof numPages === "number" && Number.isFinite(numPages) ? numPages : null;

  const lang = details.language;
  const languageName =
    lang && typeof lang === "object" && lang !== null && "name" in lang
      ? String((lang as { name?: string }).name ?? "").trim() || null
      : null;

  const format = details.format;
  const type =
    typeof format === "string" && format.trim() ? format.trim() : null;

  const publisher = details.publisher;
  const publishedBy =
    typeof publisher === "string" && publisher.trim() ? publisher.trim() : null;

  const asinRaw = details.asin;
  const asin =
    typeof asinRaw === "string" && asinRaw.trim() ? asinRaw.trim() : null;

  return {
    isbn: isbn13 && isbn13.length === 13 ? isbn13 : null,
    isbn10,
    asin,
    language: languageName,
    publishDate,
    publishedBy,
    pages,
    type,
  };
}

/** Binding type only (e.g. Hardcover), not page count. */
function extractBookEditionFormat(
  pagesFormatRaw: string,
  apolloType: string | null | undefined
): string | null {
  const fromApollo = apolloType?.trim();
  if (fromApollo) return fromApollo;

  const raw = pagesFormatRaw.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const withoutLeadingPages = raw.replace(/^\d+\s*pages?\s*,\s*/i, "").trim();
  if (withoutLeadingPages && withoutLeadingPages !== raw) {
    return withoutLeadingPages.split(",")[0]?.trim() ?? null;
  }

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^\d+\s*pages?$/i.test(parts[0]!)) {
    return parts[1] ?? null;
  }

  if (/^\d+\s*pages?$/i.test(raw)) return null;

  return raw;
}

function findBookInApolloState(
  apolloState: Record<string, unknown>,
  legacyId: string
): Record<string, unknown> | null {
  const root = apolloState.ROOT_QUERY;
  if (root && typeof root === "object") {
    const rootObj = root as Record<string, { __ref?: string }>;
    const exactKey = `getBookByLegacyId({"legacyId":"${legacyId}"})`;
    let ref = rootObj[exactKey]?.__ref;
    if (typeof ref !== "string") {
      for (const key of Object.keys(rootObj)) {
        if (
          key.startsWith("getBookByLegacyId(") &&
          key.includes(legacyId) &&
          rootObj[key]?.__ref
        ) {
          ref = rootObj[key].__ref;
          break;
        }
      }
    }
    if (typeof ref === "string" && apolloState[ref]) {
      const node = apolloState[ref];
      if (node && typeof node === "object") return node as Record<string, unknown>;
    }
  }
  for (const key of Object.keys(apolloState)) {
    if (!key.startsWith("Book:")) continue;
    const node = apolloState[key];
    if (!node || typeof node !== "object") continue;
    const b = node as { __typename?: string; legacyId?: number };
    if (b.__typename === "Book" && String(b.legacyId) === legacyId) {
      return node as Record<string, unknown>;
    }
  }
  return null;
}

// Route segment config for caching
// Revalidate every hour (3600 seconds)
export const revalidate = 3600;

export async function GET(req: NextRequest,   { params }: { params: { slug: string } }) {
  try {
    // Apply rate limiting
    await API_CONFIG.rateLimit.check(req, "get_book_details");
    console.log("Rate limit applied");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    
    // Don't cache rate limit responses
    rateLimitResponse.headers.set('Cache-Control', 'no-store');
    
    return rateLimitResponse;
  }

  try {
    const { slug } = await params;
    
    // Check Redis cache
    const cacheKey = generateCacheKey(req, "get_book_details", { slug });
    const cachedData = await getCachedResponse(cacheKey);
    
    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set(
        'Cache-Control',
        'public, s-maxage=3600, stale-while-revalidate=86400'
      );
      cachedResponse.headers.set('X-Cache', 'HIT');
      return cachedResponse;
    }
    const scrapeURL = `https://www.goodreads.com/book/show/${slug}`;


    const response = await fetchWithConfig(scrapeURL);
    const htmlString = await response.text();
    const $ = cheerio.load(htmlString);

    const cover = $(".ResponsiveImage").attr("src");
    const series = $("h3.Text__italic").text();
    const seriesURL = $("h3.Text__italic > a").attr("href");
    const title = $('h1[data-testid="bookTitle"]').text();
    const pagesText = $('[data-testid="pagesFormat"]').text();
    const pagesMatch = pagesText.match(/(\d+)/);
    const legacyId = extractLegacyIdFromSlug(slug);
    const apolloDetails = legacyId
      ? parseApolloBookDetails(htmlString, legacyId)
      : null;
    const pages =
      apolloDetails?.pages ??
      (pagesMatch ? parseInt(pagesMatch[1], 10) : null);
    const author = $(".ContributorLinksList > span > a")
      .map((i: number, el: any) => {
        const $el = $(el);
        const name = $el
          .find("span")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const url = $el.attr("href").replace("https://www.goodreads.com", "");
        const id = i + 1;
        return {
          id: id,
          name: name,
          url: url,
        };
      })
      .toArray();
    const rating = $("div.RatingStatistics__rating").text().slice(0, 4);
    const ratingCount = $('[data-testid="ratingsCount"]')
      .text()
      .split("rating")[0];
    const reviewsCountText = $('[data-testid="reviewsCount"]').first().text();
    // Remove duplicates if text is repeated (e.g., "190,601 reviews190,601 reviews" -> "190,601 reviews")
    const reviewsCount = reviewsCountText.replace(/(.+?)\1+/, '$1').trim();
    const description = $('[data-testid="description"]').text();
    const genres = $('[data-testid="genresList"] > ul > span > span')
      .map((i: number, el: any) => $(el).find("span").text().replace("Genres", "").trim())
      .get()
      .filter((genre: string) => genre && genre.length > 0);
    const bookEdition = extractBookEditionFormat(
      pagesText,
      apolloDetails?.type
    );
    const publishDate =
      apolloDetails?.publishDate ??
      normalizePublicationDate(
        $('[data-testid="publicationInfo"]').text()
      );
    const related = $("div.DynamicCarousel__itemsArea > div > div")
      .map((i: number, el: any) => {
        const $el = $(el);
        const title = $el
          .find('div > a > div:nth-child(2) > [data-testid="title"]')
          .html();
        const author = $el
          .find('div > a > div:nth-child(2) > [data-testid="author"]')
          .html();
        const src = $el
          .find("div > a > div:nth-child(1) > div > div > img")
          .attr("src");
        const url = $el
          .find("div > a")
          .attr("href")
          .replace("https://www.goodreads.com", "");
        const id = i + 1;
        return {
          id: id,
          src: src,
          title: title,
          author: author,
          url: url,
        };
      })
      .toArray();

    const rating5 = $(
      ".ReviewsSectionStatistics__histogram > div > div:nth-child(1) > div:nth-child(3)"
    )
      .text()
      .split("(")[0]
      .replace(" ", "");
    const rating4 = $(
      ".ReviewsSectionStatistics__histogram > div > div:nth-child(2) > div:nth-child(3)"
    )
      .text()
      .split("(")[0]
      .replace(" ", "");
    const rating3 = $(
      ".ReviewsSectionStatistics__histogram > div > div:nth-child(3) > div:nth-child(3)"
    )
      .text()
      .split("(")[0]
      .replace(" ", "");

    const rating2 = $(
      ".ReviewsSectionStatistics__histogram > div > div:nth-child(4) > div:nth-child(3)"
    )
      .text()
      .split("(")[0]
      .replace(" ", "");

    const rating1 = $(
      ".ReviewsSectionStatistics__histogram > div > div:nth-child(5) > div:nth-child(3)"
    )
      .text()
      .split("(")[0]
      .replace(" ", "");

    const reviewBreakdown = {
      rating5: rating5,
      rating4: rating4,
      rating3: rating3,
      rating2: rating2,
      rating1: rating1,
    };

    const reviews = $(".ReviewsList > div:nth-child(2) > div")
      .filter(Boolean)
      .map((i: number, el: any) => {
        const $el = $(el);
        const image = $el
          .find("div > article > div > div > section > a > img")
          .attr("src");
        const author = $el
          .find(
            "div > article > div > div > section:nth-child(2) > span:nth-child(1) > div > a"
          )
          .text();
        const date = $el
          .find("div > article > section > section:nth-child(1) > span > a")
          .text();
        const stars = $el
          .find("div > article > section > section:nth-child(1) > div > span")
          .attr("aria-label");
        const text = $el
          .find(
            "div > article > section > section:nth-child(2) > section > div > div > span"
          )
          .html();
        const likes = $el
          .find(
            "div > article > section > footer > div > div:nth-child(1) > button > span"
          )
          .text();
        const id = i + 1;

        return {
          id: id,
          image: image,
          author: author,
          date: date,
          stars: stars,
          text: text,
          likes: likes,
        };
      })
      .toArray();

    const quotes = $(
      "div.BookDiscussions > div.BookDiscussions__list > a.DiscussionCard:nth-child(1) > div.DiscussionCard__middle > div.DiscussionCard__stats"
    ).text();
    const quotesURL = $(
      "div.BookDiscussions > div.BookDiscussions__list > a.DiscussionCard:nth-child(1)"
    ).attr("href");

    const questions = $(
      "div.BookDiscussions > div.BookDiscussions__list > a.DiscussionCard:nth-child(3) > div.DiscussionCard__middle > div.DiscussionCard__stats"
    ).text();
    const questionsURL = $(
      "div.BookDiscussions > div.BookDiscussions__list > a.DiscussionCard:nth-child(3)"
    ).attr("href");
    const lastScraped = new Date().toISOString();

    const apiResponse = NextResponse.json({
      success: true,
      scrapedURL: scrapeURL,
      book: {
        cover,
        series,
        seriesURL,
        pages,
        slug,
        title,
        author,
        rating,
        ratingCount,
        reviewsCount,
        description,
        genres,
        bookEdition,
        publishDate,
        isbn: apolloDetails?.isbn ?? null,
        isbn10: apolloDetails?.isbn10 ?? null,
        asin: apolloDetails?.asin ?? null,
        language: apolloDetails?.language ?? null,
        publishedBy: apolloDetails?.publishedBy ?? null,
        type: apolloDetails?.type ?? null,
        related,
        reviewBreakdown,
        reviews,
        quotes,
        quotesURL,
        questions,
        questionsURL,
        lastScraped,
      }
    });

    // Set cache headers for client-side caching
    // Cache for 1 hour, allow stale-while-revalidate for 24 hours
    apiResponse.headers.set(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    );
    apiResponse.headers.set('X-Cache', 'MISS');

    // Cache response in Redis for 4 hours
    await setCachedResponse(cacheKey, {
      success: true,
      scrapedURL: scrapeURL,
      book: {
        cover,
        series,
        seriesURL,
        pages,
        slug,
        title,
        author,
        rating,
        ratingCount,
        reviewsCount,
        description,
        genres,
        bookEdition,
        publishDate,
        isbn: apolloDetails?.isbn ?? null,
        isbn10: apolloDetails?.isbn10 ?? null,
        asin: apolloDetails?.asin ?? null,
        language: apolloDetails?.language ?? null,
        publishedBy: apolloDetails?.publishedBy ?? null,
        type: apolloDetails?.type ?? null,
        related,
        reviewBreakdown,
        reviews,
        quotes,
        quotesURL,
        questions,
        questionsURL,
        lastScraped,
      }
    });

    return apiResponse;

  } catch (error) {
    const errorResponse = NextResponse.json({
      success: false,
      status: "Error - Invalid Query",
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 404 });
    
    // Don't cache error responses
    errorResponse.headers.set('Cache-Control', 'no-store');
    
    return errorResponse;
  }
}
