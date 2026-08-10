import {
  getProvider,
  listAvailableProviders,
  listProviders,
} from "@/lib/providers/registry";
import { resolveWorkKeys } from "@/lib/canonical/work-resolver";
import type {
  BookCoversInput,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedEditionCover,
  NormalizedSearchBook,
  NormalizedSearchResponse,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  NormalizedSeriesSearchResponse,
  ProviderId,
  SeriesDetailsInput,
  SeriesSearchInput,
} from "@/lib/providers/types";
import { isTextInLanguage, normalizeBookFormat, normalizeAndRankCategories, pickBestCoverUrl, selectBestCover } from "@/lib/canonical/constants";
import { getImageDimensions } from "@/lib/utils/image-size";
import { toIso639_1 } from "@/lib/languages";

function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return normalized.length === 10 || normalized.length === 13 ? normalized : null;
}

/**
 * Token patterns that indicate an adaptation, companion, or split volume rather
 * than the original novel. Matching any of these penalises relevance score.
 * Hard-coded in constants — move to DB if you need runtime configurability.
 */
const ADAPTATION_PATTERNS: RegExp[] = [
  /\bgraphic\s+novel\b/i,
  /\billustrated\b/i,
  /\bcómic\b/i,
  /\bcomic\b/i,
  /\bvolume\b/i,
  /\bvolumen\b/i,
  /\btomo\b/i,
  /\bpart\s+\d+\b/i,
  /\bparte\s+\d+\b/i,
  /\blibro\s+\d+\b/i,
  /\bcompanion\b/i,
  /\bworld\s+of\b/i,
  /\bguide\s+to\b/i,
  /\bguía\s+de\b/i,
];

/**
 * Score a search hit for relevance against the query string.
 * Higher is more relevant. Negative scores are possible for poor matches.
 */
export function scoreRelevance(book: NormalizedSearchBook, query: string): number {
  let score = 0;
  const normQuery = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normTitle = (book.title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normWorkTitle = (book.workTitle || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normAuthor = (book.author || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Title signals
  if (normTitle === normQuery) score += 100;
  else if (normTitle.startsWith(normQuery)) score += 60;
  else if (normTitle.includes(normQuery)) score += 30;

  // Work title signals (canonical English title cross-match)
  if (normWorkTitle && normWorkTitle === normQuery) score += 80;
  else if (normWorkTitle && normWorkTitle.startsWith(normQuery)) score += 50;
  else if (normWorkTitle && normWorkTitle.includes(normQuery)) score += 20;

  // Author signal — partial last-name match is enough
  const queryTokens = normQuery.split(" ");
  const authorLastName = normAuthor.split(" ").pop() ?? normAuthor;
  if (normAuthor === normQuery) score += 40;
  else if (queryTokens.some((t) => authorLastName.includes(t) && t.length > 3)) score += 20;

  // ISBN: exact query match
  const queryIsbn = normalizeIsbn(query);
  if (queryIsbn) {
    if (book.isbn === queryIsbn || book.isbn10 === queryIsbn) score += 50;
    if (book.edition?.isbn === queryIsbn || book.edition?.isbn10 === queryIsbn) score += 50;
  }

  // Having any ISBN is a quality signal
  if (book.isbn || book.isbn10 || book.edition?.isbn) score += 10;

  // Adaptation / companion penalties
  const titleForPenalty = book.title || "";
  for (const pattern of ADAPTATION_PATTERNS) {
    if (pattern.test(titleForPenalty)) {
      score -= 60;
      break;
    }
  }

  // Extra-token penalty: titles much longer than the query tend to be sub-works
  const titleTokenCount = normTitle.split(" ").length;
  const queryTokenCount = normQuery.split(" ").length;
  if (titleTokenCount > queryTokenCount + 2) {
    score -= (titleTokenCount - queryTokenCount - 2) * 5;
  }

  return score;
}

const PRIMARY_PROVIDERS = new Set<ProviderId>(["goodreads", "hardcover"]);

function isPrimaryProvider(providerId?: string | null): boolean {
  return providerId ? PRIMARY_PROVIDERS.has(providerId as ProviderId) : false;
}

/**
 * Merge two hits for the same work, prioritizing Primary providers (goodreads, hardcover)
 * for core work structure (title, author, workTitle, rating), and using Backup providers
 * (isbndb, openlibrary) to backfill missing fields (ISBNs, edition details, covers, genres).
 */
function mergeBooks(a: NormalizedSearchBook, b: NormalizedSearchBook): NormalizedSearchBook {
  const translators = Array.from(
    new Set([...(a.translators ?? []), ...(b.translators ?? [])].filter(Boolean))
  );

  const aIsPrimary = isPrimaryProvider(a.provider);
  const bIsPrimary = isPrimaryProvider(b.provider);

  const primaryHit = aIsPrimary && !bIsPrimary ? a : bIsPrimary && !aIsPrimary ? b : a;
  const secondaryHit = primaryHit === a ? b : a;

  const rawGenres = [...(a.genres ?? []), ...(b.genres ?? [])];
  const cleanGenres = normalizeAndRankCategories(rawGenres, 5);

  const cover = pickBestCoverUrl([a.cover, b.cover, a.edition?.cover, b.edition?.cover]);
  const isbn = primaryHit.isbn || secondaryHit.isbn || null;
  const isbn10 = primaryHit.isbn10 || secondaryHit.isbn10 || null;
  const publicationDate = primaryHit.publicationDate || secondaryHit.publicationDate || undefined;
  const language = primaryHit.language || secondaryHit.language || null;
  const languageCode = primaryHit.languageCode || secondaryHit.languageCode || null;

  return {
    id: primaryHit.id || secondaryHit.id,
    provider: primaryHit.provider,
    title: primaryHit.title || secondaryHit.title,
    workTitle: primaryHit.workTitle || secondaryHit.workTitle || primaryHit.title,
    author: primaryHit.author || secondaryHit.author,
    cover,
    rating: primaryHit.rating ?? secondaryHit.rating,
    publicationDate,
    genres: cleanGenres.length > 0 ? cleanGenres : undefined,
    isbn,
    isbn10,
    language,
    languageCode,
    translators: translators.length > 0 ? translators : undefined,
    presentation: primaryHit.presentation || secondaryHit.presentation || "isbn",
    confidence: primaryHit.confidence ?? secondaryHit.confidence,
    sources: Array.from(new Set([...(a.sources ?? []), ...(b.sources ?? [])])),
    edition: primaryHit.edition || secondaryHit.edition,
  };
}

/** Build the compact editions[] array for a group of hits that share a work key. */
function buildEditionsArray(
  members: NormalizedSearchBook[]
): NormalizedSearchBook["editions"] {
  const seen = new Set<string>();
  const editions: NonNullable<NormalizedSearchBook["editions"]> = [];

  for (const m of members) {
    const isbn = m.isbn ?? m.edition?.isbn ?? null;
    const isbn10 = m.isbn10 ?? m.edition?.isbn10 ?? null;
    const dedupeKey = isbn ?? isbn10 ?? null;

    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);

    const hasIdentifier = isbn || isbn10;
    if (!hasIdentifier) continue; // skip edition-less hits

    const edCover = pickBestCoverUrl([m.cover, m.edition?.cover]);

    editions.push({
      isbn: isbn ?? null,
      isbn10: isbn10 ?? null,
      language: m.language ?? m.edition?.language ?? null,
      format: (m.edition?.format ?? null)?.toLowerCase() ?? null,
      publicationDate: m.publicationDate ?? m.edition?.publicationDate ?? null,
      cover: edCover || undefined,
    });

    if (editions.length >= 5) break;
  }

  return editions.length > 0 ? editions : undefined;
}

/**
 * Group provider search hits by resolved canonical work key, pick the best
 * representative per group, and attach a compact editions[] array.
 *
 * Replaces the old ISBN-keyed deduplication.
 */
export async function groupAndMergeByWork(
  books: NormalizedSearchBook[],
  query: string
): Promise<NormalizedSearchBook[]> {
  if (books.length === 0) return [];

  // Score every hit before grouping so we can pick the best representative
  const scored = books.map((book) => ({
    book,
    score: scoreRelevance(book, query),
  }));

  // Resolve work keys concurrently
  const resolutions = await resolveWorkKeys(books);

  // Group by work key, tracking scores
  const groups = new Map<
    string,
    { representative: NormalizedSearchBook; bestScore: number; members: NormalizedSearchBook[] }
  >();

  for (let i = 0; i < books.length; i++) {
    const { book, score } = scored[i];
    const { workKey } = resolutions[i];

    const existing = groups.get(workKey);
    if (!existing) {
      groups.set(workKey, { representative: book, bestScore: score, members: [book] });
    } else {
      existing.members.push(book);
      existing.representative = mergeBooks(existing.representative, book);
      if (score > existing.bestScore) {
        existing.bestScore = score;
      }
    }
  }

  // Check if primary provider hits (goodreads, hardcover) exist anywhere in the input
  const hasPrimaryHits = books.some((b) => isPrimaryProvider(b.provider));

  // Build final results: attach editions[], sort by group bestScore
  const results: Array<{ result: NormalizedSearchBook; score: number }> = [];

  for (const { representative, bestScore, members } of groups.values()) {
    // If primary provider hits exist, main works must originate from primary providers (goodreads, hardcover).
    // Skip standalone hits that only came from backup data aggregators (isbndb, openlibrary).
    const hasPrimaryMember = members.some((m) => isPrimaryProvider(m.provider));
    if (hasPrimaryHits && !hasPrimaryMember) {
      continue;
    }

    // Ensure the representative uses a title that matches the query, or a primary provider hit as base
    const normQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    
    const queryMatchingMember = members.find((m) => {
      const normTitle = (m.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const normWork = (m.workTitle || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      return normTitle.includes(normQuery) || normWork.includes(normQuery);
    });

    const primaryMember = members.find((m) => isPrimaryProvider(m.provider));
    const baseMember = queryMatchingMember || primaryMember || representative;
    const finalRepresentative = mergeBooks(baseMember, representative);

    if (finalRepresentative.workTitle) {
      const normTitle = (finalRepresentative.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const normWork = finalRepresentative.workTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      
      const titleMatches = normTitle.includes(normQuery);
      const workMatches = normWork.includes(normQuery);

      if (!titleMatches && workMatches) {
        finalRepresentative.title = finalRepresentative.workTitle;
      }
    }

    const editions = buildEditionsArray(members);
    results.push({
      result: editions ? { ...finalRepresentative, editions } : finalRepresentative,
      score: bestScore,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.map((r) => r.result);
}

/**
 * @deprecated Use groupAndMergeByWork for new code.
 * Kept for backward compatibility with per-provider search endpoints that
 * don't need async work resolution.
 */
export function dedupeSearchBooks(books: NormalizedSearchBook[]): NormalizedSearchBook[] {
  const byKey = new Map<string, NormalizedSearchBook>();

  for (const book of books) {
    const isbn13 = normalizeIsbn(book.isbn ?? book.edition?.isbn ?? null);
    const isbn10 = normalizeIsbn(book.isbn10 ?? book.edition?.isbn10 ?? null);
    const titleKey = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
    const key =
      (isbn13 && isbn13.length === 13 ? `isbn13:${isbn13}` : null) ||
      (isbn10 && isbn10.length === 10 ? `isbn10:${isbn10}` : null) ||
      `ta:${titleKey}`;

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
    throw new Error(
      "No configured book metadata providers are available."
    );
  }
}

import { upsertCanonicalWorkFromProvider } from "@/lib/canonical/merger";
import {
  canonicalWorkToDetails,
  findCanonicalWork,
  getCanonicalSeriesDetails,
  searchCanonicalBooks,
  searchCanonicalSeries,
} from "@/lib/canonical/reader";

/**
 * A local canonical work result is "complete" enough to short-circuit provider
 * calls when it has at least one of: a known rating, a provider mapping, or an
 * edition with an ISBN. This avoids serving a single poorly-populated or
 * incorrectly split work from cache while better provider evidence exists.
 */
function isLocalWorkComplete(book: NormalizedSearchBook): boolean {
  if (book.rating != null) return true;
  if (book.isbn || book.isbn10 || book.edition?.isbn || book.edition?.isbn10) return true;
  return false;
}

export async function searchAggregate(
  input: BookSearchInput
): Promise<NormalizedSearchResponse> {
  const targetLanguage = input.language ? toIso639_1(input.language) : null;
  // Postgres is the canonical read-through store. A local hit is complete for
  // this request and avoids spending provider quota or adding network latency —
  // but only when the results pass a completeness threshold.
  try {
    const localBooks = await searchCanonicalBooks(input);
    const matchingLocalBooks = targetLanguage
      ? localBooks.filter(
          (book) =>
            toIso639_1(book.languageCode || book.language) === targetLanguage
        )
      : localBooks;
    // Only short-circuit if every returned work looks sufficiently populated.
    const allComplete = matchingLocalBooks.length > 0 &&
      matchingLocalBooks.every(isLocalWorkComplete);
    if (allComplete) {
      return {
        success: true,
        provider: "aggregate",
        results: {
          query: input.query,
          totalResults: matchingLocalBooks.length,
          books: matchingLocalBooks,
        },
      };
    }
  } catch (error) {
    console.error("Canonical book search failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.search(input)));

  const books: NormalizedSearchBook[] = [];
  let lastError: Error | null = null;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const provider = providers[i];
    if (result.status === "fulfilled") {
      books.push(...result.value);
    } else {
      const err =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
      lastError = err;
      if (err.message.includes("429")) {
        console.warn(
          `[SearchAggregate] Provider "${provider.id}" rate limited (429) for query "${input.query}"`
        );
      } else {
        console.error(
          `[SearchAggregate] Provider "${provider.id}" search failed for query "${input.query}": ${err.message}`
        );
      }
    }
  }

  const merged = await groupAndMergeByWork(books, input.query);

  // Prioritize hits matching language preference or ISBNDB hits when searching by ISBN
  const cleanQueryIsbn = normalizeIsbn(input.query);
  const targetIso1 = targetLanguage;

  // `language` is a filter, not merely a ranking hint. Providers which cannot
  // prove the language of a hit must not leak a default English work into the
  // response.
  const languageFiltered = targetIso1
    ? merged.filter(
        (book) => toIso639_1(book.languageCode || book.language) === targetIso1
      )
    : merged;

  languageFiltered.sort((a, b) => {
    if (targetIso1) {
      const aLang = (a.languageCode || a.language || "").toLowerCase();
      const bLang = (b.languageCode || b.language || "").toLowerCase();
      const aMatch = aLang.includes(targetIso1);
      const bMatch = bLang.includes(targetIso1);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
    }

    if (cleanQueryIsbn || input.type === "isbn") {
      const aIsbndb = a.provider === "isbndb" || a.isbn === cleanQueryIsbn || a.isbn10 === cleanQueryIsbn ? 1 : 0;
      const bIsbndb = b.provider === "isbndb" || b.isbn === cleanQueryIsbn || b.isbn10 === cleanQueryIsbn ? 1 : 0;
      return bIsbndb - aIsbndb;
    }

    return 0;
  });

  const finalBooks = languageFiltered.slice(0, input.limit);

  // If every provider failed and we have no books, surface the error.
  if (finalBooks.length === 0 && lastError && settled.every((r) => r.status === "rejected")) {
    throw lastError;
  }

  // Ingest hits into Prisma Canonical Store in background / read-through
  for (const b of finalBooks) {
    upsertCanonicalWorkFromProvider({
      provider: b.provider,
      providerWorkId: b.id,
      title: b.title,
      originalTitle: b.workTitle,
      authorName: b.author,
      language: b.languageCode || b.language || input.language,
      publicationDate: b.publicationDate,
      isbn10: b.isbn10 || b.edition?.isbn10,
      isbn13: b.isbn || b.edition?.isbn,
      asin: b.edition?.asin,
      coverUrl: b.cover || b.edition?.cover,
      rating: b.rating,
      genres: b.genres,
    }).catch((err) => console.error("Canonical background ingest error:", err));
  }

  return {
    success: true,
    provider: "aggregate",
    results: {
      query: input.query,
      totalResults: finalBooks.length,
      books: finalBooks,
    },
  };
}

export async function getDetailsAggregate(
  input: BookDetailsInput
): Promise<NormalizedBookDetailsResponse> {
  try {
    const localWork = await findCanonicalWork(input.slug);
    if (localWork) {
      const primaryEdition = localWork.editions?.[0];
      const hasCompleteData =
        localWork.translations?.some((t: any) => t.description?.trim()) &&
        primaryEdition?.publisher &&
        primaryEdition?.pages;

      if (hasCompleteData) {
        return canonicalWorkToDetails(localWork, input.language, input.slug);
      }
    }
  } catch (error) {
    console.error("Canonical detail lookup failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  // Parallel Provider Details Fetch & Prioritized Merge
  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.getDetails(input)));

  const fulfilled = settled
    .map((res, idx) => ({ res, provider: providers[idx] }))
    .filter((item): item is { res: PromiseFulfilledResult<NormalizedBookDetailsResponse>; provider: (typeof providers)[number] } => item.res.status === "fulfilled");

  if (fulfilled.length === 0) {
    const firstErr = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw firstErr?.reason || new Error("No provider could resolve book details");
  }

  // Provider Priority Order: Primary providers (goodreads, hardcover) first, then Backup providers (isbndb, openlibrary)
  const PROVIDER_PRIORITY: ProviderId[] = ["goodreads", "hardcover", "isbndb", "openlibrary"];
  const sortedMatches = fulfilled.slice().sort((a, b) => {
    return PROVIDER_PRIORITY.indexOf(a.provider.id) - PROVIDER_PRIORITY.indexOf(b.provider.id);
  });
  const primaryMatch = sortedMatches[0];
  const otherMatches = fulfilled.filter((item) => item !== primaryMatch);

  const primaryBook: any = primaryMatch.res.value.book || {};
  const mergedBook: Record<string, unknown> = { ...primaryBook };

  // 1. Description / Synopsis: Multi-vendor resolution with language prioritization & fallback
  const targetIso = input.language ? toIso639_1(input.language) : null;
  let description: string | null = null;

  // Pass A: Search for target language description across ALL fulfilled provider responses
  if (targetIso) {
    for (const m of fulfilled) {
      const b: any = m.res.value.book || {};
      const bookLangIso = toIso639_1(b.language || b.languageCode || "");
      if (
        typeof b.description === "string" &&
        b.description.trim() &&
        isTextInLanguage(b.description, targetIso)
      ) {
        description = b.description.trim();
        break;
      }
      if (Array.isArray(b.translations)) {
        const transMatch = b.translations.find(
          (t: any) =>
            typeof t.description === "string" &&
            t.description.trim() &&
            isTextInLanguage(t.description, targetIso)
        );
        if (transMatch) {
          description = transMatch.description.trim();
          break;
        }
      }
    }
  }

  // Pass B: Fall back to primary description or any available vendor description if target language description missing
  if (!description) {
    description = typeof primaryBook.description === "string" && primaryBook.description.trim()
      ? primaryBook.description.trim()
      : null;

    if (!description) {
      for (const m of fulfilled) {
        const b: any = m.res.value.book || {};
        if (typeof b.description === "string" && b.description.trim()) {
          description = b.description.trim();
          break;
        }
        if (Array.isArray(b.translations)) {
          const transMatch = b.translations.find(
            (t: any) => typeof t.description === "string" && t.description.trim()
          );
          if (transMatch) {
            description = transMatch.description.trim();
            break;
          }
        }
      }
    }
  }

  mergedBook.description = description;

  // 2. Publication Date
  let publicationDate = primaryBook.publicationDate || primaryBook.publishDate;
  if (!publicationDate) {
    for (const m of otherMatches) {
      const d = (m.res.value.book as any)?.publicationDate || (m.res.value.book as any)?.publishDate;
      if (d) {
        publicationDate = d;
        break;
      }
    }
  }
  mergedBook.publicationDate = publicationDate || null;

  // 3. Publisher
  let publisher = primaryBook.publisher || primaryBook.publishedBy;
  if (!publisher) {
    for (const m of otherMatches) {
      const pub = (m.res.value.book as any)?.publisher || (m.res.value.book as any)?.publishedBy;
      if (pub) {
        publisher = pub;
        break;
      }
    }
  }
  mergedBook.publisher = publisher || null;
  mergedBook.publishedBy = publisher || null;

  // 4. Language
  let language = targetIso || primaryBook.language;
  if (!language) {
    for (const m of otherMatches) {
      const l = (m.res.value.book as any)?.language;
      if (l) {
        language = l;
        break;
      }
    }
  }
  mergedBook.language = language || null;

  // 5. Pages & Audio Length
  let pages = primaryBook.pages;
  if (!pages) {
    for (const m of otherMatches) {
      const pg = (m.res.value.book as any)?.pages;
      if (pg) {
        pages = pg;
        break;
      }
    }
  }
  mergedBook.pages = pages || null;

  let audioLength = primaryBook.audioLength;
  let audioLengthMinutes = primaryBook.audioLengthMinutes;
  if (!audioLength) {
    for (const m of otherMatches) {
      const al = (m.res.value.book as any)?.audioLength;
      const alm = (m.res.value.book as any)?.audioLengthMinutes;
      if (al || alm) {
        audioLength = al;
        audioLengthMinutes = alm;
        break;
      }
    }
  }
  mergedBook.audioLength = audioLength || null;
  mergedBook.audioLengthMinutes = audioLengthMinutes || null;

  // 5b. Contributors by role
  mergedBook.translators = primaryBook.translators || fulfilled.flatMap((m) => (m.res.value.book as any)?.translators || []).filter(Boolean);
  mergedBook.illustrators = primaryBook.illustrators || fulfilled.flatMap((m) => (m.res.value.book as any)?.illustrators || []).filter(Boolean);
  mergedBook.narrators = primaryBook.narrators || fulfilled.flatMap((m) => (m.res.value.book as any)?.narrators || []).filter(Boolean);
  mergedBook.editors = primaryBook.editors || fulfilled.flatMap((m) => (m.res.value.book as any)?.editors || []).filter(Boolean);

  // 6. Genres / Categories: Combine all genres, normalize, rank, and cap to top 5
  const rawGenresList: string[] = fulfilled.flatMap((m) => (m.res.value.book as any)?.genres || []);
  const cleanGenres = normalizeAndRankCategories(rawGenresList, 5);
  mergedBook.genres = cleanGenres;

  // 7. Cover Priority: Hardcover > Other services > Goodreads (last resort)
  const allCovers = fulfilled.flatMap((m) => {
    const b: any = m.res.value.book || {};
    return [b.cover, b.coverUrl, b.image, b.matchedEdition?.cover];
  });
  mergedBook.cover = pickBestCoverUrl([primaryBook.cover, primaryBook.coverUrl, ...allCovers]);

  // Synchronous background ingest into Prisma Canonical store
  await Promise.all(
    fulfilled.map(async (m) => {
      const b: any = m.res.value.book;
      if (b) {
        const primaryAuthorName = typeof b.author === "string"
          ? b.author
          : Array.isArray(b.author)
            ? b.author[0]?.name
            : b.author?.name;
        await upsertCanonicalWorkFromProvider({
          provider: m.provider.id,
          providerWorkId: String(b.id || input.slug),
          title: String(b.title || ""),
          originalTitle: b.originalTitle || b.workTitle,
          authorName: primaryAuthorName,
          description: String(mergedBook.description || b.description || ""),
          language: String(b.language || b.languageCode || targetIso || input.language || ""),
          publicationYear: b.publicationYear || b.originalPublicationYear,
          publicationDate: String(mergedBook.publicationDate || b.publicationDate || b.publishDate || ""),
          publisher: String(mergedBook.publisher || b.publishedBy || b.publisher || b.edition?.publisher || ""),
          pages: typeof mergedBook.pages === "number" ? mergedBook.pages : (b.pages || b.edition?.pages),
          audioLengthMinutes: typeof mergedBook.audioLengthMinutes === "number" ? (mergedBook.audioLengthMinutes as number) : (b.audioLengthMinutes || b.edition?.audioLengthMinutes),
          isbn10: b.isbn10 || b.edition?.isbn10,
          isbn13: b.isbn13 || b.isbn || b.edition?.isbn,
          asin: b.asin || b.edition?.asin,
          format: b.type || b.bookEdition || b.format || b.edition?.format,
          coverUrl: b.coverUrl || b.cover || b.image,
          rating: typeof b.rating === "number" ? b.rating : (typeof b.rating === "string" ? parseFloat(b.rating) || undefined : undefined),
          ratingsCount: b.ratingsCount,
          genres: cleanGenres,
          seriesName: typeof b.series === "string" ? b.series.replace(/\s*#\d+.*$/, "") : (b.series?.name || b.seriesName),
          seriesPosition: b.series?.position || b.seriesPosition,
          translators: b.translators,
          illustrators: b.illustrators,
          narrators: b.narrators,
        }).catch((err) => console.error("Canonical detail ingest error:", err));
      }
    })
  );

  try {
    const freshWork = await findCanonicalWork(input.slug);
    if (freshWork) {
      return canonicalWorkToDetails(freshWork, input.language, input.slug);
    }
  } catch (freshErr) {
    // Continue with mergedBook if fresh lookup fails
  }

  return {
    success: true,
    provider: "aggregate",
    scrapedURL: primaryMatch.res.value.scrapedURL,
    book: mergedBook,
  };
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

  try {
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
  } catch (error) {
    console.error(
      `[SearchByProviderId] Provider "${providerId}" search failed for query "${input.query}":`,
      error
    );
    throw error;
  }
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

export async function getCoversAggregate(
  input: BookCoversInput
): Promise<NormalizedBookCoversResponse> {
  try {
    const localWork = await findCanonicalWork(input.slug);
    if (localWork) {
      const localCovers = localWork.editions.flatMap((edition, editionIndex) =>
        edition.covers.map((cover) => ({
          editionId: editionIndex + 1,
          title: edition.title,
          url: cover.url,
          width: cover.width,
          height: cover.height,
          ratio: cover.width && cover.height ? cover.width / cover.height : null,
          color: null,
          pixelCount: cover.pixelCount,
          imageId: null,
          format: cover.imageFormat,
          isbn: edition.isbn13,
          isbn10: edition.isbn10,
          asin: edition.asin,
          publicationDate: edition.publicationDate,
          pages: edition.pages,
          publisher: edition.publisher,
          language: edition.language,
          languageCode: edition.language,
          country: null,
          countryCode: null,
          isDefault: cover.isDefault,
        }))
      );
      const filtered = (input.onlyWithCover ? localCovers.filter((cover) => cover.url) : localCovers)
        .sort((a, b) => (b.pixelCount || 0) - (a.pixelCount || 0))
        .slice(0, input.limit);
      if (filtered.length > 0) {
        const best = filtered[0];
        return {
          success: true,
          provider: "aggregate",
          scrapedURL: `canonical://work/${localWork.id}`,
          book: {
            id: localWork.id,
            slug: localWork.slug,
            title: localWork.canonicalTitle,
            provider: "isbndb",
          },
          covers: filtered,
          bestByResolution: {
            editionId: best.editionId,
            url: best.url,
            width: best.width,
            height: best.height,
            pixelCount: best.pixelCount,
          },
          totalCovers: filtered.length,
          totalEditions: localWork.editions.length,
        };
      }
    }
  } catch (error) {
    console.error("Canonical cover lookup failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.getCovers(input)));

  const allCovers: NormalizedEditionCover[] = [];
  let primaryBookInfo = {
    id: input.slug,
    slug: input.slug,
    title: input.slug,
    provider: "aggregate" as ProviderId,
  };
  let scrapedURL = `aggregate://${input.slug}`;
  let totalEditionsCount = 0;
  let lastError: Error | null = null;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      const res = result.value;
      if (res.book) {
        primaryBookInfo = {
          id: res.book.id || primaryBookInfo.id,
          slug: res.book.slug || primaryBookInfo.slug,
          title: res.book.title || primaryBookInfo.title,
          provider: res.book.provider || primaryBookInfo.provider,
        };
        scrapedURL = res.scrapedURL || scrapedURL;
      }
      totalEditionsCount += res.totalEditions || 0;
      allCovers.push(...res.covers);
    } else {
      lastError =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
    }
  }

  if (allCovers.length === 0 && lastError && settled.every((r) => r.status === "rejected")) {
    throw lastError;
  }

  const seenUrls = new Set<string>();
  const uniqueCovers: NormalizedEditionCover[] = [];
  for (const c of allCovers) {
    if (!c.url || seenUrls.has(c.url.trim())) continue;
    seenUrls.add(c.url.trim());
    uniqueCovers.push(c);
  }

  const processedCovers = await Promise.all(
    uniqueCovers.map(async (cover, index) => {
      let w = cover.width;
      let h = cover.height;
      let px = cover.pixelCount;
      let format = cover.format;
      let ratio = cover.ratio;

      if (!w || !h || !px) {
        const measured = await getImageDimensions(cover.url);
        if (measured.width && measured.height) {
          w = measured.width;
          h = measured.height;
          px = measured.pixelCount;
          format = measured.format || format;
          ratio = w / h;
        }
      }

      return {
        ...cover,
        editionId: index + 1,
        width: w,
        height: h,
        pixelCount: px,
        format: format,
        ratio: ratio || (w && h ? w / h : null),
        isDefault: false,
      };
    })
  );

  const scored = processedCovers.map((c) => {
    const px = c.pixelCount || (c.width && c.height ? c.width * c.height : 0);
    const r = c.ratio || (c.width && c.height ? c.width / c.height : 0);
    const isBookRatio = r >= 0.5 && r <= 0.85;
    const score = px + (isBookRatio ? 2000 : 0);
    return { cover: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const rankedCovers = scored.map((item, idx) => ({
    ...item.cover,
    isDefault: idx === 0,
  }));

  const bestByResolution =
    rankedCovers.length > 0 && rankedCovers[0].url
      ? {
          editionId: rankedCovers[0].editionId,
          url: rankedCovers[0].url,
          width: rankedCovers[0].width,
          height: rankedCovers[0].height,
          pixelCount: rankedCovers[0].pixelCount,
        }
      : null;

  return {
    success: true,
    provider: "aggregate",
    scrapedURL,
    book: primaryBookInfo,
    covers: rankedCovers,
    bestByResolution,
    totalCovers: rankedCovers.length,
    totalEditions: Math.max(totalEditionsCount, rankedCovers.length),
  };
}

export async function getCoversByProviderId(
  providerId: ProviderId,
  input: BookCoversInput
): Promise<NormalizedBookCoversResponse> {
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

  return provider.getCovers(input);
}

function seriesDedupeKey(series: NormalizedSearchSeries): string {
  if (series.slug) {
    return `slug:${series.slug.trim().toLowerCase()}`;
  }
  return `name:${series.name.trim().toLowerCase()}|${(series.author || "").trim().toLowerCase()}`;
}

function mergeSeries(
  a: NormalizedSearchSeries,
  b: NormalizedSearchSeries
): NormalizedSearchSeries {
  return {
    id: a.id || b.id,
    provider: a.provider,
    name: a.name || b.name,
    slug: a.slug || b.slug,
    author: a.author || b.author,
    booksCount: a.booksCount ?? b.booksCount,
    primaryBooksCount: a.primaryBooksCount ?? b.primaryBooksCount,
    readersCount: a.readersCount ?? b.readersCount,
    sampleBooks:
      (a.sampleBooks?.length ? a.sampleBooks : undefined) ||
      (b.sampleBooks?.length ? b.sampleBooks : undefined),
  };
}

export function dedupeSearchSeries(
  series: NormalizedSearchSeries[]
): NormalizedSearchSeries[] {
  const byKey = new Map<string, NormalizedSearchSeries>();

  for (const entry of series) {
    const key = seriesDedupeKey(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
    } else {
      byKey.set(key, mergeSeries(existing, entry));
    }
  }

  return Array.from(byKey.values());
}

export async function searchSeriesAggregate(
  input: SeriesSearchInput
): Promise<NormalizedSeriesSearchResponse> {
  try {
    const localSeries = await searchCanonicalSeries(input.query, input.limit);
    if (localSeries.length > 0) {
      return {
        success: true,
        provider: "aggregate",
        results: {
          query: input.query,
          totalResults: localSeries.length,
          series: localSeries,
        },
      };
    }
  } catch (error) {
    console.error("Canonical series search failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const settled = await Promise.allSettled(providers.map((p) => p.searchSeries(input)));

  const series: NormalizedSearchSeries[] = [];
  let lastError: Error | null = null;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      series.push(...result.value);
    } else {
      lastError =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
    }
  }

  const merged = dedupeSearchSeries(series).slice(0, input.limit);

  if (merged.length === 0 && lastError && settled.every((r) => r.status === "rejected")) {
    throw lastError;
  }

  return {
    success: true,
    provider: "aggregate",
    results: {
      query: input.query,
      totalResults: merged.length,
      series: merged,
    },
  };
}

export async function searchSeriesByProviderId(
  providerId: ProviderId,
  input: SeriesSearchInput
): Promise<NormalizedSeriesSearchResponse> {
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

  const series = await provider.searchSeries(input);
  return {
    success: true,
    provider: providerId,
    results: {
      query: input.query,
      totalResults: series.length,
      series: series.slice(0, input.limit),
    },
  };
}

export async function getSeriesDetailsAggregate(
  input: SeriesDetailsInput
): Promise<NormalizedSeriesDetailsResponse> {
  try {
    const localSeries = await getCanonicalSeriesDetails(input);
    if (localSeries) return localSeries;
  } catch (error) {
    console.error("Canonical series lookup failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const errors: Error[] = [];

  for (const provider of providers) {
    try {
      const details = await provider.getSeriesDetails(input);
      return {
        ...details,
        provider: "aggregate",
      };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  throw errors[0] || new Error("No provider could resolve series details");
}

export async function getSeriesDetailsByProviderId(
  providerId: ProviderId,
  input: SeriesDetailsInput
): Promise<NormalizedSeriesDetailsResponse> {
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

  return provider.getSeriesDetails(input);
}
