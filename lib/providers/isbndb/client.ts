import { isbndbLimiter } from "@/lib/outgoing-rate-limiter";
import {
  buildLogicalCacheKey,
  CACHE_TTL_DETAILS,
  CACHE_TTL_SEARCH,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";
import type {
  BookCoversInput,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedEditionCover,
  NormalizedSearchBook,
} from "@/lib/providers/types";

const ISBNDB_BASE = "https://api2.isbndb.com";

export type ISBNDBBook = {
  title?: string;
  title_long?: string;
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  authors?: string[];
  publisher?: string;
  publish_date?: string;
  date_published?: string;
  pages?: number;
  image?: string;
  overview?: string;
  synopsys?: string;
  synopsis?: string;
  language?: string;
  edition?: string;
  binding?: string;
  subjects?: string[];
};

export type ISBNDBBookResponse = {
  book?: ISBNDBBook;
  message?: string;
};

export type ISBNDBSearchResponse = {
  total?: number;
  books?: ISBNDBBook[];
  message?: string;
};

function getHeaders(): Record<string, string> {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    throw new Error("ISBNDB_API_KEY environment variable is not configured");
  }
  return {
    Authorization: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function cleanIsbn(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  return clean.length === 10 || clean.length === 13 ? clean : null;
}

function mapIsbndbBookToSearchBook(b: ISBNDBBook): NormalizedSearchBook {
  const isbn13 = cleanIsbn(b.isbn13 || b.isbn);
  const isbn10 = cleanIsbn(b.isbn10);
  const id = isbn13 || isbn10 || b.isbn || "unknown";
  const title = b.title || b.title_long || "Untitled";
  const author = Array.isArray(b.authors) && b.authors.length > 0
    ? b.authors.join(", ")
    : "Unknown Author";
  const cover = b.image || "";
  const pubDate = b.date_published || b.publish_date || undefined;

  return {
    id,
    provider: "isbndb",
    title,
    workTitle: b.title_long || undefined,
    author,
    cover,
    publicationDate: pubDate,
    genres: Array.isArray(b.subjects) && b.subjects.length > 0 ? b.subjects : undefined,
    isbn: isbn13 || isbn10 || null,
    isbn10: isbn10 || null,
    language: b.language || null,
    presentation: "isbn",
    sources: [
      {
        title,
        url: `https://isbndb.com/book/${id}`,
      },
    ],
    edition: {
      id: 0,
      title,
      isbn: isbn13 || isbn10 || null,
      isbn10: isbn10 || null,
      asin: null,
      format: b.binding || null,
      publicationDate: pubDate || null,
      pages: typeof b.pages === "number" ? b.pages : null,
      publisher: b.publisher || null,
      language: b.language || null,
      languageCode: null,
      country: null,
      countryCode: null,
      cover,
    },
  };
}

import { getLanguageName, toIso639_1 } from "@/lib/languages";

export async function searchIsbndb(
  input: BookSearchInput
): Promise<NormalizedSearchBook[]> {
  const query = input.query.trim();
  if (!query) return [];

  const limit = Math.min(Math.max(input.limit || 20, 1), 50);
  const languagePref = input.language ? toIso639_1(input.language) : null;
  const languageName = input.language ? getLanguageName(input.language) : null;

  const cacheKey = buildLogicalCacheKey("provider:isbndb:search", {
    query,
    limit,
    language: languagePref || "",
  });
  const cached = await getCachedResponse(cacheKey);
  if (cached && Array.isArray(cached)) {
    return cached;
  }

  const headers = getHeaders();

  // If query is an ISBN, try exact book endpoint first
  const isbnClean = cleanIsbn(query);
  if (isbnClean) {
    try {
      await isbndbLimiter.acquire();
      const res = await fetch(`${ISBNDB_BASE}/book/${encodeURIComponent(isbnClean)}`, {
        headers,
      });
      if (res.status === 429) {
        console.warn(`[ISBNDB] Rate limited (HTTP 429) for ISBN query: "${isbnClean}"`);
        throw new Error("ISBNDB rate limit reached (429)");
      }
      if (res.ok) {
        const data: ISBNDBBookResponse = await res.json();
        if (data.book) {
          const results = [mapIsbndbBookToSearchBook(data.book)];
          await setCachedResponse(cacheKey, results, CACHE_TTL_SEARCH);
          return results;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("429")) throw err;
      console.warn(`[ISBNDB] Exact ISBN lookup failed for ${isbnClean}:`, err);
    }
  }

  // General search across ISBNDB books catalog
  await isbndbLimiter.acquire();
  const searchUrl = `${ISBNDB_BASE}/books/${encodeURIComponent(query)}?page=1&pageSize=${limit}`;
  const res = await fetch(searchUrl, { headers });

  if (res.status === 429) {
    console.warn(`[ISBNDB] Rate limited (HTTP 429) for query: "${query}"`);
    throw new Error("ISBNDB rate limit reached (429)");
  }

  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`ISBNDB search API error (${res.status}): ${res.statusText}`);
  }

  const data: ISBNDBSearchResponse = await res.json();
  let rawBooks = data.books || [];

  if (languagePref || languageName) {
    const targetIso = (languagePref || "").toLowerCase();
    const targetName = (languageName || "").toLowerCase();

    // Sort/filter books that match the specified language
    rawBooks = [...rawBooks].sort((a, b) => {
      const aLang = (a.language || "").toLowerCase();
      const bLang = (b.language || "").toLowerCase();
      const aMatch = aLang.includes(targetIso) || aLang.includes(targetName);
      const bMatch = bLang.includes(targetIso) || bLang.includes(targetName);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }

  const results = rawBooks.map(mapIsbndbBookToSearchBook);

  const normQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  if (normQuery.length >= 3) {
    for (const book of results) {
      if (book.workTitle) {
        const normTitle = (book.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
        const normWork = book.workTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
        if (!normTitle.includes(normQuery) && normWork.includes(normQuery)) {
          book.title = book.workTitle;
        }
      }
    }
  }

  await setCachedResponse(cacheKey, results, CACHE_TTL_SEARCH);
  return results;
}

export async function getIsbndbBookDetails(
  input: BookDetailsInput
): Promise<NormalizedBookDetailsResponse> {
  const slug = input.slug.trim();
  const cacheKey = buildLogicalCacheKey("provider:isbndb:details", { slug });
  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    return cached;
  }

  const headers = getHeaders();
  await isbndbLimiter.acquire();
  const url = `${ISBNDB_BASE}/book/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { headers });

  if (res.status === 429) {
    console.warn(`[ISBNDB] Rate limited (HTTP 429) for book details slug: "${slug}"`);
    throw new Error("ISBNDB rate limit reached (429)");
  }

  if (!res.ok) {
    throw new Error(`ISBNDB book details API error (${res.status}) for slug "${slug}"`);
  }

  const data: ISBNDBBookResponse = await res.json();
  const b = data.book;
  if (!b) {
    throw new Error(`ISBNDB book details not found for "${slug}"`);
  }

  const isbn13 = cleanIsbn(b.isbn13 || b.isbn);
  const isbn10 = cleanIsbn(b.isbn10);
  const id = isbn13 || isbn10 || slug;
  const title = b.title || b.title_long || slug;
  const author = Array.isArray(b.authors) && b.authors.length > 0
    ? b.authors.join(", ")
    : "Unknown Author";

  const response: NormalizedBookDetailsResponse = {
    success: true,
    provider: "isbndb",
    scrapedURL: url,
    book: {
      id,
      title,
      workTitle: b.title_long || null,
      author,
      authors: b.authors || [],
      description: b.synopsis || b.synopsys || b.overview || null,
      publicationDate: b.date_published || b.publish_date || null,
      publisher: b.publisher || null,
      pages: typeof b.pages === "number" ? b.pages : null,
      isbn: isbn13 || isbn10 || null,
      isbn10: isbn10 || null,
      format: b.binding || null,
      cover: b.image || null,
      genres: b.subjects || [],
      language: b.language || null,
    },
  };

  await setCachedResponse(cacheKey, response, CACHE_TTL_DETAILS);
  return response;
}

export async function getIsbndbCovers(
  input: BookCoversInput
): Promise<NormalizedBookCoversResponse> {
  const slug = input.slug.trim();
  const details = await getIsbndbBookDetails({ slug });
  const bookObj = details.book as Record<string, unknown>;

  const covers: NormalizedEditionCover[] = [];
  const coverUrl = (bookObj.cover as string) || null;

  if (coverUrl && (!input.onlyWithCover || coverUrl.trim().length > 0)) {
    covers.push({
      editionId: 0,
      title: (bookObj.title as string) || null,
      url: coverUrl,
      width: null,
      height: null,
      ratio: null,
      color: null,
      pixelCount: null,
      imageId: null,
      format: (bookObj.format as string) || null,
      isbn: (bookObj.isbn as string) || null,
      isbn10: (bookObj.isbn10 as string) || null,
      asin: null,
      publicationDate: (bookObj.publicationDate as string) || null,
      pages: (bookObj.pages as number) || null,
      publisher: (bookObj.publisher as string) || null,
      language: (bookObj.language as string) || null,
      languageCode: null,
      country: null,
      countryCode: null,
      isDefault: true,
    });
  }

  const bestByResolution = covers.length > 0
    ? {
        editionId: covers[0].editionId,
        url: covers[0].url,
        width: null,
        height: null,
        pixelCount: null,
      }
    : null;

  return {
    success: true,
    provider: "isbndb",
    scrapedURL: details.scrapedURL,
    book: {
      id: (bookObj.id as string) || slug,
      slug,
      title: (bookObj.title as string) || slug,
      provider: "isbndb",
    },
    covers,
    bestByResolution,
    totalCovers: covers.length,
    totalEditions: 1,
  };
}
