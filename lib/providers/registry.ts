import { hardcoverProvider } from "@/lib/providers/hardcover";
import { isbndbProvider } from "@/lib/providers/isbndb";
import { openLibraryProvider } from "@/lib/providers/openlibrary";
import type { BookDataProvider, ProviderId } from "@/lib/providers/types";

/**
 * Registered, active structured providers.
 * To add a provider: implement BookDataProvider under lib/providers/<name>/
 * and append it here. Aggregate will pick it up automatically.
 */
const ACTIVE_PROVIDERS: BookDataProvider[] = [
  hardcoverProvider,
  isbndbProvider,
  openLibraryProvider,
];

export function listProviders(): BookDataProvider[] {
  return [...ACTIVE_PROVIDERS];
}

export function listAvailableProviders(): BookDataProvider[] {
  return ACTIVE_PROVIDERS.filter((provider) => provider.isAvailable());
}

export function getProvider(id: ProviderId): BookDataProvider | undefined {
  return ACTIVE_PROVIDERS.find((provider) => provider.id === id);
}

export function getRegisteredProviderIds(): ProviderId[] {
  return ACTIVE_PROVIDERS.map((provider) => provider.id);
}
