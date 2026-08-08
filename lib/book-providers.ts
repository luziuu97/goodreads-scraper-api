import { prisma } from "@/lib/db";
import {
  buildLogicalCacheKey,
  CACHE_TTL_SEARCH,
  getCachedResponses,
  setCachedResponse,
} from "@/lib/redis-cache";
import {
  getCoversAggregate,
  getCoversByProviderId,
  getDetailsAggregate,
  getDetailsByProviderId,
  getSeriesDetailsAggregate,
  getSeriesDetailsByProviderId,
  searchAggregate,
  searchByProviderId,
  searchSeriesAggregate,
  searchSeriesByProviderId,
} from "@/lib/providers/aggregate";
import { parseProvider } from "@/lib/providers/parse-provider";
import type {
  BookProviderMode,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  NormalizedSeriesDetailsResponse,
  NormalizedSeriesSearchResponse,
  ProviderId,
} from "@/lib/providers/types";

export type { BookProviderMode as BookProvider };
export type {
  BookMetadataSource,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedEditionCover,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  NormalizedSearchSeries,
  NormalizedSeriesBook,
  NormalizedSeriesDetailsResponse,
  NormalizedSeriesSearchResponse,
  ProviderId,
} from "@/lib/providers/types";

export { parseProvider };

export type BatchSearchItemInput = {
  query?: string;
  isbn?: string;
  title?: string;
  author?: string;
  limit?: number;
  type?: string;
  language?: string;
};

export type BatchSearchItemResult = {
  index: number;
  query: string;
  success: boolean;
  books?: NormalizedSearchBook[];
  error?: string;
};

export type BatchSearchResponse = {
  success: true;
  provider: BookProviderMode;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  results: BatchSearchItemResult[];
};

export async function searchBooksByProvider(input: {
  provider: BookProviderMode;
  query: string;
  limit: number;
  type: string;
  language?: string;
}): Promise<NormalizedSearchResponse> {
  const { provider, query, limit, type, language } = input;

  if (provider === "aggregate") {
    return searchAggregate({ query, limit, type, language });
  }

  return searchByProviderId(provider, { query, limit, type, language });
}

export async function batchSearchBooksByProvider(input: {
  provider: BookProviderMode;
  items: BatchSearchItemInput[];
}): Promise<BatchSearchResponse> {
  const { provider, items } = input;
  const results: BatchSearchItemResult[] = new Array(items.length);

  type ProcessableItem = {
    index: number;
    query: string;
    type: string;
    limit: number;
    language?: string;
    cacheKey: string;
  };

  const processableItems: ProcessableItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const query = (
      raw.isbn ||
      raw.query ||
      `${raw.title || ""} ${raw.author || ""}`
    ).trim();

    if (!query) {
      results[i] = {
        index: i,
        query: "",
        success: false,
        error: "Item must specify a query, isbn, or title/author",
      };
      continue;
    }

    const type = raw.type || (raw.isbn ? "isbn" : "all");
    const limit = raw.limit ? Math.min(Math.max(raw.limit, 1), 50) : 10;
    const language = raw.language?.trim() || undefined;

    const cacheKey = buildLogicalCacheKey("search_books", {
      provider,
      type,
      limit,
      query,
      language: language || "",
    });

    processableItems.push({
      index: i,
      query,
      type,
      limit,
      language,
      cacheKey,
    });
  }

  // Resolve the whole batch in one Redis round trip. Items with equivalent
  // normalized inputs share a cache key and therefore share downstream work.
  const cachedByKey = await getCachedResponses(
    processableItems.map((item) => item.cacheKey)
  );

  const cacheMisses: ProcessableItem[] = [];

  for (const item of processableItems) {
    const cached = cachedByKey.get(item.cacheKey);
    if (cached && Array.isArray(cached?.results?.books)) {
      results[item.index] = {
        index: item.index,
        query: item.query,
        success: true,
        books: cached.results.books,
      };
    } else {
      cacheMisses.push(item);
    }
  }

  // Only one representative per logical request should touch the DB/provider.
  const uniqueMisses = Array.from(
    new Map(cacheMisses.map((item) => [item.cacheKey, item])).values()
  );

  // Try resolving all local ISBN hits with one database query.
  const remainingMisses: ProcessableItem[] = [];
  const isbnByCacheKey = new Map<string, string>();
  for (const miss of uniqueMisses) {
    const cleanIsbn = miss.query.replace(/[^0-9X]/gi, "").toUpperCase();
    if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
      isbnByCacheKey.set(miss.cacheKey, cleanIsbn);
    }
  }

  let editionsByIsbn = new Map<string, any>();
  if (isbnByCacheKey.size > 0) {
    try {
      const isbns = Array.from(new Set(isbnByCacheKey.values()));
      const editions = await prisma.edition.findMany({
        where: {
          OR: [
            { isbn13: { in: isbns } },
            { isbn10: { in: isbns } },
            { asin: { in: isbns } },
          ],
        },
        include: {
          work: {
            include: {
              author: true,
              genres: { include: { genre: true } },
            },
          },
          covers: true,
        },
      });
      for (const edition of editions) {
        for (const value of [edition.isbn13, edition.isbn10, edition.asin]) {
          if (value && !editionsByIsbn.has(value.toUpperCase())) {
            editionsByIsbn.set(value.toUpperCase(), edition);
          }
        }
      }
    } catch {
      // Ignore DB lookup errors and proceed to providers.
      editionsByIsbn = new Map();
    }
  }

  for (const miss of uniqueMisses) {
    const cleanIsbnStr = isbnByCacheKey.get(miss.cacheKey);
    const dbEd = cleanIsbnStr ? editionsByIsbn.get(cleanIsbnStr) : undefined;
    if (dbEd) {
            const defaultCover = dbEd.covers.find((c: { isDefault: boolean }) => c.isDefault) || dbEd.covers[0];
            const searchBook: NormalizedSearchBook = {
              id: dbEd.work.id,
              provider: "isbndb",
              title: dbEd.title || dbEd.work.canonicalTitle,
              workTitle: dbEd.work.canonicalTitle,
              author: dbEd.work.author?.name || "Unknown Author",
              cover: defaultCover?.url || "",
              rating: dbEd.work.averageRating ?? undefined,
              publicationDate: dbEd.publicationDate || (dbEd.work.publicationYear ? String(dbEd.work.publicationYear) : undefined),
              genres: dbEd.work.genres.map((g: { genre: { name: string } }) => g.genre.name),
              isbn: dbEd.isbn13 || dbEd.isbn10 || null,
              isbn10: dbEd.isbn10 || null,
              language: dbEd.language || null,
              presentation: "isbn" as const,
              edition: {
                id: 0,
                title: dbEd.title,
                isbn: dbEd.isbn13,
                isbn10: dbEd.isbn10,
                asin: dbEd.asin,
                format: dbEd.format,
                publicationDate: dbEd.publicationDate,
                pages: dbEd.pages,
                publisher: dbEd.publisher,
                language: dbEd.language,
                languageCode: null,
                country: null,
                countryCode: null,
                cover: defaultCover?.url || "",
              },
            };

            const responseData = {
              success: true,
              provider: "aggregate",
              results: {
                query: miss.query,
                totalResults: 1,
                books: [searchBook],
              },
            };

            results[miss.index] = {
              index: miss.index,
              query: miss.query,
              success: true,
              books: [searchBook],
            };

            await setCachedResponse(miss.cacheKey, responseData, CACHE_TTL_SEARCH);
      continue;
    }
    remainingMisses.push(miss);
  }

  // 2. Process remaining cache misses with max concurrency limit of 5
  const CONCURRENCY_LIMIT = 5;
  for (let i = 0; i < remainingMisses.length; i += CONCURRENCY_LIMIT) {
    const chunk = remainingMisses.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      chunk.map(async (miss) => {
        try {
          const responseData = await searchBooksByProvider({
            provider,
            query: miss.query,
            limit: miss.limit,
            type: miss.type,
            language: miss.language,
          });

          results[miss.index] = {
            index: miss.index,
            query: miss.query,
            success: true,
            books: responseData.results.books,
          };

          if (
            Array.isArray(responseData.results.books) &&
            responseData.results.books.length > 0
          ) {
            await setCachedResponse(miss.cacheKey, responseData, CACHE_TTL_SEARCH);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Search failed";
          results[miss.index] = {
            index: miss.index,
            query: miss.query,
            success: false,
            error: msg,
          };
        }
      })
    );
  }

  // Fan the representative result back out to duplicate inputs.
  const resultByCacheKey = new Map<string, BatchSearchItemResult>();
  for (const item of uniqueMisses) {
    if (results[item.index]) resultByCacheKey.set(item.cacheKey, results[item.index]);
  }
  for (const item of cacheMisses) {
    const representative = resultByCacheKey.get(item.cacheKey);
    if (representative) {
      results[item.index] = { ...representative, index: item.index, query: item.query };
    }
  }

  let successfulItems = 0;
  let failedItems = 0;
  for (const r of results) {
    if (r?.success) {
      successfulItems++;
    } else {
      failedItems++;
    }
  }

  return {
    success: true,
    provider,
    totalItems: items.length,
    successfulItems,
    failedItems,
    results,
  };
}

export async function getBookDetailsByProvider(input: {
  provider: BookProviderMode;
  slug: string;
  editionId?: number;
}): Promise<NormalizedBookDetailsResponse> {
  const { provider, slug, editionId } = input;

  if (provider === "aggregate") {
    return getDetailsAggregate({ slug, editionId });
  }

  return getDetailsByProviderId(provider, { slug, editionId });
}

export async function getBookCoversByProvider(input: {
  provider: BookProviderMode;
  slug: string;
  limit: number;
  onlyWithCover: boolean;
}): Promise<NormalizedBookCoversResponse> {
  const { provider, slug, limit, onlyWithCover } = input;

  if (provider === "aggregate") {
    return getCoversAggregate({ slug, limit, onlyWithCover });
  }

  return getCoversByProviderId(provider, { slug, limit, onlyWithCover });
}

export async function searchSeriesByProvider(input: {
  provider: BookProviderMode;
  query: string;
  limit: number;
}): Promise<NormalizedSeriesSearchResponse> {
  const { provider, query, limit } = input;

  if (provider === "aggregate") {
    return searchSeriesAggregate({ query, limit });
  }

  return searchSeriesByProviderId(provider, { query, limit });
}

export async function getSeriesDetailsByProvider(input: {
  provider: BookProviderMode;
  slug: string;
  limit: number;
  offset: number;
  language?: string;
  format?: string;
}): Promise<NormalizedSeriesDetailsResponse> {
  const { provider, slug, limit, offset, language, format } = input;

  if (provider === "aggregate") {
    return getSeriesDetailsAggregate({ slug, limit, offset, language, format });
  }

  return getSeriesDetailsByProviderId(provider, {
    slug,
    limit,
    offset,
    language,
    format,
  });
}
