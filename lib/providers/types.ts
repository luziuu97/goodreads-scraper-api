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
  /**
   * Presentation title for the hit. When the query matched a translated
   * edition (e.g. "Juego de Tronos"), this is the edition title; otherwise
   * the canonical work title.
   */
  title: string;
  /** Canonical work title on the provider (e.g. "A Game of Thrones"). */
  workTitle?: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string;
  genres?: string[];
  isbn?: string | null;
  isbn10?: string | null;
  language?: string | null;
  languageCode?: string | null;
  /** Translator names when a matched edition lists them. */
  translators?: string[];
  /**
   * How presentation fields were chosen:
   * - work: default work metadata
   * - edition: a specific edition matched the query / language preference
   * - isbn: exact ISBN edition match
   */
  presentation?: "work" | "edition" | "isbn";
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
    language: string | null;
    languageCode: string | null;
    country: string | null;
    countryCode: string | null;
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

/** Single edition cover with image metadata for gallery / best-resolution selection. */
export type NormalizedEditionCover = {
  editionId: number;
  title: string | null;
  url: string;
  width: number | null;
  height: number | null;
  ratio: number | null;
  color: string | null;
  /** width × height when both known; used to rank resolution. */
  pixelCount: number | null;
  imageId: number | null;
  format: string | null;
  isbn: string | null;
  isbn10: string | null;
  asin: string | null;
  publicationDate: string | null;
  pages: number | null;
  publisher: string | null;
  language: string | null;
  languageCode: string | null;
  country: string | null;
  countryCode: string | null;
  isDefault: boolean;
};

export type NormalizedBookCoversResponse = {
  success: true;
  provider: BookProviderMode;
  scrapedURL: string;
  book: {
    id: string;
    slug: string;
    title: string;
    provider: ProviderId;
  };
  covers: NormalizedEditionCover[];
  bestByResolution: {
    editionId: number;
    url: string;
    width: number | null;
    height: number | null;
    pixelCount: number | null;
  } | null;
  totalCovers: number;
  totalEditions: number;
};

export type BookSearchInput = {
  query: string;
  limit: number;
  type: string;
  /**
   * Optional ISO language preference (e.g. es, en). When set, search hits
   * prefer editions in that language for title/cover/translator presentation.
   */
  language?: string;
};

export type BookDetailsInput = {
  slug: string;
  editionId?: number;
};

export type BookCoversInput = {
  slug: string;
  /** Max editions to request from the provider (default applied by route). */
  limit: number;
  /** When true (default), omit editions with no cover URL. */
  onlyWithCover: boolean;
};

/** Series hit from structured search (distinct from book search results). */
export type NormalizedSearchSeries = {
  id: string;
  provider: ProviderId;
  name: string;
  slug: string;
  author?: string;
  booksCount?: number;
  primaryBooksCount?: number;
  readersCount?: number;
  /** Sample book titles when the provider returns them on the hit. */
  sampleBooks?: string[];
};

export type NormalizedSeriesSearchResponse = {
  success: true;
  provider: BookProviderMode;
  results: {
    query: string;
    totalResults: number;
    series: NormalizedSearchSeries[];
  };
};

export type NormalizedSeriesBook = {
  id: string;
  slug: string;
  title: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string | null;
  position: number | null;
  positionLabel: string | null;
  featured: boolean;
  compilation: boolean;
  /** ISO 639-1 code when known (e.g. en, es). */
  languageCode: string | null;
  language: string | null;
  /** Normalized format: ebook | audiobook | hardcover | paperback | null. */
  format: string | null;
  formatLabel: string | null;
};

export type NormalizedSeriesDetailsResponse = {
  success: true;
  provider: BookProviderMode;
  scrapedURL: string;
  series: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    booksCount: number;
    primaryBooksCount: number | null;
    isCompleted: boolean | null;
    author: { id: number; name: string; url: string } | null;
    provider: ProviderId;
  };
  books: NormalizedSeriesBook[];
  filters: {
    /** Requested language param (original when omitted). */
    language: string;
    /** Resolved language code used for filtering (e.g. en). */
    resolvedLanguage: string | null;
    /** Inferred original/majority language for the series. */
    originalLanguage: string | null;
    /** Requested format filter, or null when unrestricted. */
    format: string | null;
    /** One entry kept per series position after language/format scoring. */
    dedupedByPosition: boolean;
  };
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
  };
};

export type SeriesSearchInput = {
  query: string;
  limit: number;
};

export type SeriesDetailsInput = {
  slug: string;
  /** Max books in the series list (default applied by route). */
  limit: number;
  /** Offset into ordered series books. */
  offset: number;
  /**
   * ISO language code (e.g. en, es) or "original".
   * Default / original = majority language among featured primary books.
   */
  language?: string;
  /**
   * Optional format filter: ebook | audiobook | hardcover | paperback | physical
   * (physical = hardcover OR paperback).
   */
  format?: string;
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
  getCovers(input: BookCoversInput): Promise<NormalizedBookCoversResponse>;
  searchSeries(input: SeriesSearchInput): Promise<NormalizedSearchSeries[]>;
  getSeriesDetails(input: SeriesDetailsInput): Promise<NormalizedSeriesDetailsResponse>;
}
