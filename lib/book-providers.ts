/**
 * Public facade for book metadata providers.
 * Implementation lives under lib/providers/ (registry + aggregate + adapters).
 */

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
