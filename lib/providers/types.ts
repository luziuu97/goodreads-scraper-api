/**
 * Shared book provider types and interface.
 * Add new provider ids to ProviderId as they are implemented and registered.
 */

export type ProviderId = "hardcover";

/** Dispatch modes accepted by the public API (includes virtual aggregate). */
export type BookProviderMode = "aggregate" | ProviderId;

export type BookMetadataSource = {
  title: string;
  url: string;
};

export type NormalizedSearchBook = {
  id: string;
  provider: ProviderId;
  title: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string;
  genres?: string[];
  isbn?: string | null;
  isbn10?: string | null;
  confidence?: number;
  sources?: BookMetadataSource[];
  edition?: {
    id: number;
    title?: string;
    isbn: string | null;
    isbn10: string | null;
    asin: string | null;
    format: string | null;
    publicationDate: string | null;
    pages: number | null;
    publisher: string | null;
    cover: string;
  };
};

export type NormalizedSearchResponse = {
  success: true;
  provider: BookProviderMode;
  results: {
    query: string;
    totalResults: number;
    books: NormalizedSearchBook[];
  };
};

export type NormalizedBookDetailsResponse = {
  success: true;
  provider: BookProviderMode;
  scrapedURL: string;
  book: Record<string, unknown>;
};

export type BookSearchInput = {
  query: string;
  limit: number;
  type: string;
};

export type BookDetailsInput = {
  slug: string;
  editionId?: number;
};

/**
 * Contract every structured book metadata provider must implement.
 * Register instances in registry.ts to make them part of aggregate.
 */
export interface BookDataProvider {
  id: ProviderId;
  isAvailable(): boolean;
  search(input: BookSearchInput): Promise<NormalizedSearchBook[]>;
  getDetails(input: BookDetailsInput): Promise<NormalizedBookDetailsResponse>;
}
