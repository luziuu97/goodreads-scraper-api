import {
  getProvider,
  listAvailableProviders,
  listProviders,
} from "@/lib/providers/registry";
import type {
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  ProviderId,
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

  return {
    id: a.id || b.id,
    provider: a.provider,
    title: a.title || b.title,
    author: a.author || b.author,
    cover: preferACover ? a.cover : b.cover || a.cover,
    rating: a.rating ?? b.rating,
    publicationDate: a.publicationDate || b.publicationDate,
    genres: genres.length > 0 ? genres.slice(0, 20) : undefined,
    isbn: a.isbn ?? b.isbn ?? null,
    isbn10: a.isbn10 ?? b.isbn10 ?? null,
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
    // Today only Hardcover is registered — surface config clearly.
    throw new Error(
      "HARDCOVER_API_TOKEN is required. No configured book metadata providers are available."
    );
  }
}

export async function searchAggregate(
  input: BookSearchInput
): Promise<NormalizedSearchResponse> {
  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.search(input)));

  const books: NormalizedSearchBook[] = [];
  let lastError: Error | null = null;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      books.push(...result.value);
    } else {
      lastError =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
    }
  }

  const merged = dedupeSearchBooks(books).slice(0, input.limit);

  // If every provider failed and we have no books, surface the error.
  if (merged.length === 0 && lastError && settled.every((r) => r.status === "rejected")) {
    throw lastError;
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

  const providers = listAvailableProviders();
  const errors: Error[] = [];

  for (const provider of providers) {
    try {
      const details = await provider.getDetails(input);
      return {
        ...details,
        provider: "aggregate",
        book: {
          ...details.book,
          // keep originating provider on the book object
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
