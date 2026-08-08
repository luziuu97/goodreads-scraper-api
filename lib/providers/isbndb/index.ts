import { upsertCanonicalWorkFromProvider } from "@/lib/canonical/merger";
import {
  getIsbndbBookDetails,
  getIsbndbCovers,
  searchIsbndb,
} from "@/lib/providers/isbndb/client";
import type {
  BookCoversInput,
  BookDataProvider,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSeriesDetailsResponse,
  NormalizedSeriesSearchResponse,
  SeriesDetailsInput,
  SeriesSearchInput,
} from "@/lib/providers/types";

export const isbndbProvider: BookDataProvider = {
  id: "isbndb",

  isAvailable(): boolean {
    return Boolean(process.env.ISBNDB_API_KEY && process.env.ISBNDB_API_KEY.trim().length > 0);
  },

  async search(input: BookSearchInput): Promise<NormalizedSearchBook[]> {
    const books = await searchIsbndb(input);

    // Asynchronously ingest top search hits into canonical database
    for (const book of books.slice(0, 5)) {
      upsertCanonicalWorkFromProvider({
        provider: "isbndb",
        providerWorkId: book.id,
        title: book.title,
        authorName: book.author,
        publicationYear: book.publicationDate ? parseInt(book.publicationDate, 10) || undefined : undefined,
        isbn13: book.isbn,
        isbn10: book.isbn10,
        coverUrl: book.cover,
        rating: book.rating,
        genres: book.genres,
        language: book.language ?? undefined,
      }).catch((err) => {
        console.warn(`[ISBNDB] Canonical upsert error for work ${book.id}:`, err);
      });
    }

    return books;
  },

  async getDetails(input: BookDetailsInput): Promise<NormalizedBookDetailsResponse> {
    const details = await getIsbndbBookDetails(input);
    const bookObj = details.book as Record<string, unknown>;

    if (bookObj && typeof bookObj.id === "string") {
      upsertCanonicalWorkFromProvider({
        provider: "isbndb",
        providerWorkId: bookObj.id as string,
        title: (bookObj.title as string) || input.slug,
        authorName: (bookObj.author as string) || undefined,
        description: (bookObj.description as string) || undefined,
        publicationDate: (bookObj.publicationDate as string) || undefined,
        publisher: (bookObj.publisher as string) || undefined,
        pages: (bookObj.pages as number) || undefined,
        isbn13: (bookObj.isbn as string) || undefined,
        isbn10: (bookObj.isbn10 as string) || undefined,
        format: (bookObj.format as string) || undefined,
        coverUrl: (bookObj.cover as string) || undefined,
        genres: (bookObj.genres as string[]) || undefined,
        language: (bookObj.language as string) || undefined,
      }).catch((err) => {
        console.warn(`[ISBNDB] Canonical upsert error for details ${bookObj.id}:`, err);
      });
    }

    return details;
  },

  async getCovers(input: BookCoversInput): Promise<NormalizedBookCoversResponse> {
    return getIsbndbCovers(input);
  },

  async searchSeries(input: SeriesSearchInput): Promise<NormalizedSeriesSearchResponse["results"]["series"]> {
    // ISBNDB does not support structured series search
    return [];
  },

  async getSeriesDetails(input: SeriesDetailsInput): Promise<NormalizedSeriesDetailsResponse> {
    return {
      success: true,
      provider: "isbndb",
      scrapedURL: `https://api2.isbndb.com`,
      series: {
        id: input.slug,
        slug: input.slug,
        name: input.slug,
        description: null,
        booksCount: 0,
        primaryBooksCount: 0,
        isCompleted: null,
        author: null,
        provider: "isbndb",
      },
      books: [],
      filters: {
        language: input.language ?? "original",
        resolvedLanguage: null,
        originalLanguage: null,
        format: input.format ?? null,
        dedupedByPosition: false,
      },
      pagination: {
        limit: input.limit,
        offset: input.offset,
        returned: 0,
        total: 0,
      },
    };
  },
};
