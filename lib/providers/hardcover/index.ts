import { getHardcoverApiToken } from "@/lib/api-config";
import { parseSeriesLabel } from "@/lib/canonical/authority";
import { upsertCanonicalWorkFromProvider } from "@/lib/canonical/merger";
import {
  fetchHardcoverBookCovers,
  fetchHardcoverBookDetails,
  fetchHardcoverSeriesDetails,
  searchHardcoverBooks,
  searchHardcoverSeries,
} from "@/lib/providers/hardcover/client";
import type {
  BookCoversInput,
  BookDataProvider,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  SeriesDetailsInput,
  SeriesSearchInput,
} from "@/lib/providers/types";

export const hardcoverProvider: BookDataProvider = {
  id: "hardcover",

  isAvailable(): boolean {
    return Boolean(getHardcoverApiToken());
  },

  async search(input: BookSearchInput): Promise<NormalizedSearchBook[]> {
    const results = await searchHardcoverBooks(input);
    const books = results.books.map((book) => ({
      id: book.id,
      provider: "hardcover" as const,
      title: book.title,
      workTitle: book.workTitle,
      author: book.author,
      cover: book.cover,
      rating: book.rating,
      readersCount: book.readersCount,
      ratingsCount: book.ratingsCount,
      publicationDate: book.publicationDate,
      genres: book.genres,
      language: book.language,
      languageCode: book.languageCode,
      translators: book.translators,
      illustrators: book.illustrators,
      narrators: book.narrators,
      presentation: book.presentation,
      edition: book.edition,
      editions: book.editions,
      isbn: book.edition?.isbn ?? undefined,
      isbn10: book.edition?.isbn10 ?? undefined,
    }));

    for (const b of results.books.slice(0, 5)) {
      upsertCanonicalWorkFromProvider({
        provider: "hardcover",
        providerWorkId: b.id,
        title: b.workTitle || b.title,
        authorName: b.author,
        coverUrl: b.cover,
        rating: b.rating,
        ratingsCount: (b as any).ratingsCount || (b as any).ratings_count || (b as any).users_count,
        reviewsCount: (b as any).reviewsCount || (b as any).reviews_count,
        genres: b.genres,
        language: b.languageCode || b.language || undefined,
        publicationDate: b.publicationDate,
        isbn10: b.edition?.isbn10,
        isbn13: b.edition?.isbn,
        asin: b.edition?.asin,
        format: b.edition?.format,
        editions: Array.isArray(b.editions)
          ? b.editions.map((ed: any) => ({
              isbn10: ed.isbn10 || ed.isbn_10,
              isbn13: ed.isbn13 || ed.isbn || ed.isbn_13,
              asin: ed.asin,
              format: ed.format,
              language: ed.language,
              publicationDate: ed.publicationDate,
              coverUrl: ed.cover,
            }))
          : undefined,
      }).catch((err) => console.warn(`[Hardcover] Canonical search upsert error for work ${b.id}:`, err));
    }

    return books;
  },

  async getDetails(input: BookDetailsInput): Promise<NormalizedBookDetailsResponse> {
    const details = await fetchHardcoverBookDetails(input.slug, {
      editionId: input.editionId,
    });

    const b = details.book as Record<string, any>;
    if (b && (b.id || input.slug)) {
      const seriesRaw =
        typeof b.series === "string"
          ? b.series
          : b.series?.name || b.seriesName || null;
      const parsedSeries = parseSeriesLabel(
        typeof seriesRaw === "string" ? seriesRaw : null
      );
      const seriesName =
        parsedSeries.name ||
        (typeof b.series === "string"
          ? b.series.replace(/\s*#\d+.*$/, "").trim()
          : b.series?.name || b.seriesName) ||
        null;
      const seriesPosition =
        b.series?.position ??
        b.seriesPosition ??
        parsedSeries.position ??
        null;
      const authorName =
        typeof b.author === "string"
          ? b.author
          : Array.isArray(b.author)
            ? b.author[0]?.name
            : b.author?.name;

      // Full structural ingest (including sibling editions). Awaited so aggregate
      // callers never race a partial fire-and-forget write that omits format/country.
      try {
        await upsertCanonicalWorkFromProvider({
          provider: "hardcover",
          providerWorkId: String(b.id || input.slug),
          title: String(b.title || b.canonicalTitle || ""),
          originalTitle: b.canonicalTitle || b.workTitle || b.title,
          authorName,
          description: String(b.description || ""),
          language: String(b.languageCode || b.language || ""),
          publicationYear: b.publicationYear,
          publicationDate: String(b.publicationDate || b.publishDate || ""),
          publisher: String(b.publishedBy || b.publisher || ""),
          pages: typeof b.pages === "number" ? b.pages : undefined,
          isbn10: b.isbn10 || b.edition?.isbn10,
          isbn13: b.isbn || b.edition?.isbn,
          asin: b.asin || b.edition?.asin,
          format: b.type || b.bookEdition || b.format || b.edition?.format,
          coverUrl: b.coverUrl || b.cover || b.image || b.edition?.cover,
          country: b.country || b.edition?.country || null,
          countryCode: b.countryCode || b.edition?.countryCode || null,
          providerEditionId: b.edition?.id != null ? String(b.edition.id) : undefined,
          rating: typeof b.rating === "number" ? b.rating : (typeof b.rating === "string" ? parseFloat(b.rating) || undefined : undefined),
          ratingsCount: typeof b.ratingsCount === "number" ? b.ratingsCount : (parseInt(b.ratingCount || b.ratings_count || b.users_count, 10) || undefined),
          reviewsCount: typeof b.reviewsCount === "number" ? b.reviewsCount : (parseInt(b.reviewsCount || b.reviews_count, 10) || undefined),
          genres: b.genres,
          seriesName,
          seriesPosition: typeof seriesPosition === "number" ? seriesPosition : undefined,
          editions: Array.isArray(b.editions)
            ? b.editions.map((ed: any) => ({
                providerEditionId: ed.id != null ? String(ed.id) : undefined,
                isbn10: ed.isbn10,
                isbn13: ed.isbn || ed.isbn13,
                asin: ed.asin,
                title: ed.title,
                format: ed.format,
                language: ed.languageCode || ed.language,
                publisher: ed.publisher,
                publicationDate: ed.publicationDate,
                pages: ed.pages,
                coverUrl: ed.cover,
                country: ed.country,
                countryCode: ed.countryCode,
              }))
            : undefined,
        });
      } catch (err) {
        console.warn(`[Hardcover] Canonical getDetails upsert error:`, err);
      }
    }

    return {
      success: true,
      provider: "hardcover",
      scrapedURL: details.scrapedURL,
      book: {
        ...details.book,
        provider: "hardcover",
      },
    };
  },

  async getCovers(input: BookCoversInput): Promise<NormalizedBookCoversResponse> {
    const covers = await fetchHardcoverBookCovers(input.slug, {
      limit: input.limit,
      onlyWithCover: input.onlyWithCover,
    });

    return {
      success: true,
      provider: "hardcover",
      scrapedURL: covers.scrapedURL,
      book: {
        ...covers.book,
        provider: "hardcover",
      },
      covers: covers.covers,
      bestByResolution: covers.bestByResolution,
      totalCovers: covers.totalCovers,
      totalEditions: covers.totalEditions,
    };
  },

  async searchSeries(input: SeriesSearchInput): Promise<NormalizedSearchSeries[]> {
    const results = await searchHardcoverSeries(input);
    return results.series.map((series) => ({
      id: series.id,
      provider: "hardcover" as const,
      name: series.name,
      slug: series.slug,
      author: series.author,
      booksCount: series.booksCount,
      primaryBooksCount: series.primaryBooksCount,
      readersCount: series.readersCount,
      sampleBooks: series.sampleBooks,
    }));
  },

  async getSeriesDetails(
    input: SeriesDetailsInput
  ): Promise<NormalizedSeriesDetailsResponse> {
    const details = await fetchHardcoverSeriesDetails(input.slug, {
      limit: input.limit,
      offset: input.offset,
      language: input.language,
      format: input.format,
    });

    return {
      success: true,
      provider: "hardcover",
      scrapedURL: details.scrapedURL,
      series: {
        ...details.series,
        provider: "hardcover",
      },
      books: details.books,
      filters: details.filters,
      pagination: details.pagination,
    };
  },
};
