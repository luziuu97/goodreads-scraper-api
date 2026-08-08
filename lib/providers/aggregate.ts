import {
  getProvider,
  listAvailableProviders,
  listProviders,
} from "@/lib/providers/registry";
import type {
  BookCoversInput,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  NormalizedSeriesSearchResponse,
  ProviderId,
  SeriesDetailsInput,
  SeriesSearchInput,
} from "@/lib/providers/types";

function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return normalized.length === 10 || normalized.length === 13 ? normalized : null;
}

function titleAuthorKey(book: NormalizedSearchBook): string {
  return `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
}

function mergeBooks(a: NormalizedSearchBook, b: NormalizedSearchBook): NormalizedSearchBook {
  const genres = Array.from(
    new Set([...(a.genres ?? []), ...(b.genres ?? [])].filter(Boolean))
  );

  const preferACover = Boolean(a.cover) && a.cover.length >= (b.cover?.length ?? 0);

  const translators = Array.from(
    new Set([...(a.translators ?? []), ...(b.translators ?? [])].filter(Boolean))
  );

  // Prefer the hit that already resolved a language-specific edition presentation.
  const preferAPresentation =
    (a.presentation === "edition" || a.presentation === "isbn") &&
    b.presentation !== "edition" &&
    b.presentation !== "isbn";

  return {
    id: a.id || b.id,
    provider: a.provider,
    title: preferAPresentation ? a.title || b.title : a.title || b.title,
    workTitle: a.workTitle || b.workTitle,
    author: a.author || b.author,
    cover: preferACover ? a.cover : b.cover || a.cover,
    rating: a.rating ?? b.rating,
    publicationDate: a.publicationDate || b.publicationDate,
    genres: genres.length > 0 ? genres.slice(0, 20) : undefined,
    isbn: a.isbn ?? b.isbn ?? null,
    isbn10: a.isbn10 ?? b.isbn10 ?? null,
    language: a.language ?? b.language,
    languageCode: a.languageCode ?? b.languageCode,
    translators: translators.length > 0 ? translators : undefined,
    presentation: a.presentation || b.presentation,
    confidence: a.confidence ?? b.confidence,
    sources: [...(a.sources ?? []), ...(b.sources ?? [])],
    edition: a.edition ?? b.edition,
  };
}

/**
 * Deduplicate and merge search hits across providers.
 * Order: ISBN-13 → ISBN-10 → normalized title|author.
 */
export function dedupeSearchBooks(books: NormalizedSearchBook[]): NormalizedSearchBook[] {
  const byKey = new Map<string, NormalizedSearchBook>();

  for (const book of books) {
    const isbn13 = normalizeIsbn(book.isbn ?? book.edition?.isbn ?? null);
    const isbn10 = normalizeIsbn(book.isbn10 ?? book.edition?.isbn10 ?? null);
    const key =
      (isbn13 && isbn13.length === 13 ? `isbn13:${isbn13}` : null) ||
      (isbn10 && isbn10.length === 10 ? `isbn10:${isbn10}` : null) ||
      `ta:${titleAuthorKey(book)}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, book);
    } else {
      byKey.set(key, mergeBooks(existing, book));
    }
  }

  return Array.from(byKey.values());
}

function ensureProvidersConfigured(): void {
  const registered = listProviders();
  if (registered.length === 0) {
    throw new Error("No book metadata providers are registered");
  }

  const available = listAvailableProviders();
  if (available.length === 0) {
    throw new Error(
      "No configured book metadata providers are available."
    );
  }
}

import { upsertCanonicalWorkFromProvider, getRankedTopEditions } from "@/lib/canonical/merger";
import { resolveCanonicalByIsbn, resolveCanonicalByProviderWorkId } from "@/lib/canonical/resolver";
import { prisma } from "@/lib/db";

export async function searchAggregate(
  input: BookSearchInput
): Promise<NormalizedSearchResponse> {
  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.search(input)));

  const books: NormalizedSearchBook[] = [];
  let lastError: Error | null = null;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const provider = providers[i];
    if (result.status === "fulfilled") {
      books.push(...result.value);
    } else {
      const err =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
      lastError = err;
      console.error(
        `[SearchAggregate] Provider "${provider.id}" search failed for query "${input.query}":`,
        err
      );
    }
  }

  const merged = dedupeSearchBooks(books).slice(0, input.limit);

  // If every provider failed and we have no books, surface the error.
  if (merged.length === 0 && lastError && settled.every((r) => r.status === "rejected")) {
    throw lastError;
  }

  // Ingest hits into Prisma Canonical Store in background / read-through
  for (const b of merged) {
    upsertCanonicalWorkFromProvider({
      provider: b.provider,
      providerWorkId: b.id,
      title: b.title,
      originalTitle: b.workTitle,
      authorName: b.author,
      language: b.languageCode || b.language || input.language,
      publicationDate: b.publicationDate,
      isbn10: b.isbn10 || b.edition?.isbn10,
      isbn13: b.isbn || b.edition?.isbn,
      asin: b.edition?.asin,
      coverUrl: b.cover || b.edition?.cover,
      rating: b.rating,
      genres: b.genres,
    }).catch((err) => console.error("Canonical background ingest error:", err));
  }

  return {
    success: true,
    provider: "aggregate",
    results: {
      query: input.query,
      totalResults: merged.length,
      books: merged,
    },
  };
}

export async function getDetailsAggregate(
  input: BookDetailsInput
): Promise<NormalizedBookDetailsResponse> {
  ensureProvidersConfigured();

  // 1. Try exact ISBN resolution
  const resolvedIsbn = await resolveCanonicalByIsbn(input.slug);
  if (resolvedIsbn) {
    const work = await prisma.work.findUnique({
      where: { id: resolvedIsbn.workId },
      include: {
        author: true,
        series: { include: { translations: true } },
        translations: true,
        editions: { include: { covers: true } },
        genres: { include: { genre: true } },
      },
    });

    if (work) {
      const topEditions = getRankedTopEditions(work.editions);
      const matchedEdition = work.editions.find((e: any) => e.id === resolvedIsbn.editionId) || work.editions[0];

      return {
        success: true,
        provider: "aggregate",
        scrapedURL: `canonical://work/${work.id}`,
        book: {
          id: work.id,
          slug: work.slug,
          title: work.canonicalTitle,
          author: work.author?.name || "Unknown Author",
          rating: work.averageRating,
          ratingsCount: work.ratingsCount,
          publicationYear: work.publicationYear,
          genres: work.genres.map((g: any) => g.genre.name),
          matchedEdition: matchedEdition ? {
            id: matchedEdition.id,
            isbn13: matchedEdition.isbn13,
            isbn10: matchedEdition.isbn10,
            asin: matchedEdition.asin,
            format: matchedEdition.format,
            language: matchedEdition.language,
            publisher: matchedEdition.publisher,
            covers: matchedEdition.covers,
          } : null,
          topEditions,
          translations: work.translations,
        },
      };
    }
  }

  // 2. Provider Fetch Fallback
  const providers = listAvailableProviders();
  const errors: Error[] = [];

  for (const provider of providers) {
    try {
      const details = await provider.getDetails(input);

      // Ingest into Prisma Canonical store
      const b: any = details.book;
      if (b) {
        upsertCanonicalWorkFromProvider({
          provider: provider.id,
          providerWorkId: String(b.id || input.slug),
          title: String(b.title || ""),
          originalTitle: b.originalTitle || b.workTitle,
          authorName: typeof b.author === "string" ? b.author : b.author?.name,
          description: b.description,
          publicationYear: b.publicationYear || b.originalPublicationYear,
          publicationDate: b.publicationDate,
          publisher: b.publisher,
          pages: b.pages || b.numberOfPages,
          isbn10: b.isbn10,
          isbn13: b.isbn13 || b.isbn,
          asin: b.asin,
          format: b.format,
          coverUrl: b.coverUrl || b.cover || b.image,
          rating: b.rating || b.averageRating,
          ratingsCount: b.ratingsCount,
          genres: b.genres,
          seriesName: b.series?.name || b.seriesName,
          seriesPosition: b.series?.position || b.seriesPosition,
        }).catch((err) => console.error("Canonical detail ingest error:", err));
      }

      return {
        ...details,
        provider: "aggregate",
        book: {
          ...details.book,
        },
      };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  throw errors[0] || new Error("No provider could resolve book details");
}

export async function searchByProviderId(
  providerId: ProviderId,
  input: BookSearchInput
): Promise<NormalizedSearchResponse> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" is not registered`);
  }
  if (!provider.isAvailable()) {
    throw new Error(
      providerId === "hardcover"
        ? "HARDCOVER_API_TOKEN is required to use provider=hardcover"
        : `Provider "${providerId}" is not configured`
    );
  }

  try {
    const books = await provider.search(input);
    return {
      success: true,
      provider: providerId,
      results: {
        query: input.query,
        totalResults: books.length,
        books: books.slice(0, input.limit),
      },
    };
  } catch (error) {
    console.error(
      `[SearchByProviderId] Provider "${providerId}" search failed for query "${input.query}":`,
      error
    );
    throw error;
  }
}

export async function getDetailsByProviderId(
  providerId: ProviderId,
  input: BookDetailsInput
): Promise<NormalizedBookDetailsResponse> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" is not registered`);
  }
  if (!provider.isAvailable()) {
    throw new Error(
      providerId === "hardcover"
        ? "HARDCOVER_API_TOKEN is required to use provider=hardcover"
        : `Provider "${providerId}" is not configured`
    );
  }

  return provider.getDetails(input);
}

export async function getCoversAggregate(
  input: BookCoversInput
): Promise<NormalizedBookCoversResponse> {
  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const errors: Error[] = [];

  for (const provider of providers) {
    try {
      const covers = await provider.getCovers(input);
      return {
        ...covers,
        provider: "aggregate",
      };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  throw errors[0] || new Error("No provider could resolve book covers");
}

export async function getCoversByProviderId(
  providerId: ProviderId,
  input: BookCoversInput
): Promise<NormalizedBookCoversResponse> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" is not registered`);
  }
  if (!provider.isAvailable()) {
    throw new Error(
      providerId === "hardcover"
        ? "HARDCOVER_API_TOKEN is required to use provider=hardcover"
        : `Provider "${providerId}" is not configured`
    );
  }

  return provider.getCovers(input);
}

function seriesDedupeKey(series: NormalizedSearchSeries): string {
  if (series.slug) {
    return `slug:${series.slug.trim().toLowerCase()}`;
  }
  return `name:${series.name.trim().toLowerCase()}|${(series.author || "").trim().toLowerCase()}`;
}

function mergeSeries(
  a: NormalizedSearchSeries,
  b: NormalizedSearchSeries
): NormalizedSearchSeries {
  return {
    id: a.id || b.id,
    provider: a.provider,
    name: a.name || b.name,
    slug: a.slug || b.slug,
    author: a.author || b.author,
    booksCount: a.booksCount ?? b.booksCount,
    primaryBooksCount: a.primaryBooksCount ?? b.primaryBooksCount,
    readersCount: a.readersCount ?? b.readersCount,
    sampleBooks:
      (a.sampleBooks?.length ? a.sampleBooks : undefined) ||
      (b.sampleBooks?.length ? b.sampleBooks : undefined),
  };
}

export function dedupeSearchSeries(
  series: NormalizedSearchSeries[]
): NormalizedSearchSeries[] {
  const byKey = new Map<string, NormalizedSearchSeries>();

  for (const entry of series) {
    const key = seriesDedupeKey(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
    } else {
      byKey.set(key, mergeSeries(existing, entry));
    }
  }

  return Array.from(byKey.values());
}

export async function searchSeriesAggregate(
  input: SeriesSearchInput
): Promise<NormalizedSeriesSearchResponse> {
  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.searchSeries(input)));

  const series: NormalizedSearchSeries[] = [];
  let lastError: Error | null = null;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      series.push(...result.value);
    } else {
      lastError =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
    }
  }

  const merged = dedupeSearchSeries(series).slice(0, input.limit);

  if (merged.length === 0 && lastError && settled.every((r) => r.status === "rejected")) {
    throw lastError;
  }

  return {
    success: true,
    provider: "aggregate",
    results: {
      query: input.query,
      totalResults: merged.length,
      series: merged,
    },
  };
}

export async function searchSeriesByProviderId(
  providerId: ProviderId,
  input: SeriesSearchInput
): Promise<NormalizedSeriesSearchResponse> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" is not registered`);
  }
  if (!provider.isAvailable()) {
    throw new Error(
      providerId === "hardcover"
        ? "HARDCOVER_API_TOKEN is required to use provider=hardcover"
        : `Provider "${providerId}" is not configured`
    );
  }

  const series = await provider.searchSeries(input);
  return {
    success: true,
    provider: providerId,
    results: {
      query: input.query,
      totalResults: series.length,
      series: series.slice(0, input.limit),
    },
  };
}

export async function getSeriesDetailsAggregate(
  input: SeriesDetailsInput
): Promise<NormalizedSeriesDetailsResponse> {
  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const errors: Error[] = [];

  for (const provider of providers) {
    try {
      const details = await provider.getSeriesDetails(input);
      return {
        ...details,
        provider: "aggregate",
      };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  throw errors[0] || new Error("No provider could resolve series details");
}

export async function getSeriesDetailsByProviderId(
  providerId: ProviderId,
  input: SeriesDetailsInput
): Promise<NormalizedSeriesDetailsResponse> {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider "${providerId}" is not registered`);
  }
  if (!provider.isAvailable()) {
    throw new Error(
      providerId === "hardcover"
        ? "HARDCOVER_API_TOKEN is required to use provider=hardcover"
        : `Provider "${providerId}" is not configured`
    );
  }

  return provider.getSeriesDetails(input);
}
