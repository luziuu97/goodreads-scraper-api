/**
 * Public facade for book metadata providers.
 * Implementation lives under lib/providers/ (registry + aggregate + adapters).
 */

import {
  getDetailsAggregate,
  getDetailsByProviderId,
  searchAggregate,
  searchByProviderId,
} from "@/lib/providers/aggregate";
import { parseProvider } from "@/lib/providers/parse-provider";
import type {
  BookProviderMode,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  ProviderId,
} from "@/lib/providers/types";

export type { BookProviderMode as BookProvider };
export type {
  BookMetadataSource,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  ProviderId,
} from "@/lib/providers/types";

export { parseProvider };

export async function searchBooksByProvider(input: {
  provider: BookProviderMode;
  query: string;
  limit: number;
  type: string;
}): Promise<NormalizedSearchResponse> {
  const { provider, query, limit, type } = input;

  if (provider === "aggregate") {
    return searchAggregate({ query, limit, type });
  }

  return searchByProviderId(provider, { query, limit, type });
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
