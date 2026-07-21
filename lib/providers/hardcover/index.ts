import { getHardcoverApiToken } from "@/lib/api-config";
import {
  fetchHardcoverBookDetails,
  searchHardcoverBooks,
} from "@/lib/providers/hardcover/client";
import type {
  BookDataProvider,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
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
};
