import { getHardcoverApiToken } from "@/lib/api-config";
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
    return results.books.map((book) => ({
      id: book.id,
      provider: "hardcover" as const,
      title: book.title,
      author: book.author,
      cover: book.cover,
      rating: book.rating,
      publicationDate: book.publicationDate,
      genres: book.genres,
      edition: book.edition,
      isbn: book.edition?.isbn ?? undefined,
      isbn10: book.edition?.isbn10 ?? undefined,
    }));
  },

  async getDetails(input: BookDetailsInput): Promise<NormalizedBookDetailsResponse> {
    const details = await fetchHardcoverBookDetails(input.slug, {
      editionId: input.editionId,
    });

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
