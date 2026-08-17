import {
  getProvider,
  listAvailableProviders,
  listProviders,
} from "@/lib/providers/registry";
import {
  extractPrimaryAuthorName,
  findEditionByIsbn,
  isBackupProvider,
  isLiveStructuralProvider,
  isTrustedLocalDetailsComplete,
  isTrustedLocalSearchComplete,
  isTrustedStructuralProvider,
  languageFromDetailsBook,
  needsLocalizedDescriptionLookup,
  normalizeLookupIsbn,
  parseSeriesLabel,
  resolveDetailsDescriptionLanguage,
  siblingIsbnsForLanguage,
  workHasDescriptionInLanguage,
} from "@/lib/canonical/authority";
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
import {
  isCompilationOrDerivativeTitle,
  isGoodreadsCoverUrl,
  isIsbnIdentitySearch,
  isTextInLanguage,
  stripAlternateCoverNotes,
  toApiBookFormat,
  normalizeAndRankCategories,
  normalizeSearchText,
  pickBestCoverUrl,
  selectBestCover,
  roundRating,
} from "@/lib/canonical/constants";
import { getImageDimensions } from "@/lib/utils/image-size";
import { languageFields, languageFieldsFromParts, toIso639_1 } from "@/lib/languages";

function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return normalized.length === 10 || normalized.length === 13 ? normalized : null;
}

/**
 * Collapse near-duplicate works that share a normalized work title + author
 * but failed ISBN/work-key merge (common with accent differences).
 * Preserves first-seen rank order among distinct works.
 */
export function dedupeSearchBooksByWorkTitle(
  books: NormalizedSearchBook[]
): NormalizedSearchBook[] {
  const seen = new Map<string, NormalizedSearchBook>();
  const order: string[] = [];
  for (const book of books) {
    const work = normalizeSearchText(book.workTitle || book.title);
    const author =
      normalizeSearchText(book.author || "").split(" ").pop() || "";
    // Long English work titles are unique enough without author — and author
    // can be polluted (e.g. illustrator GrandPré instead of Rowling on HC).
    const key =
      work.split(" ").filter(Boolean).length >= 4 ? work : `${work}|${author}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, book);
      order.push(key);
      continue;
    }
    const preferNew =
      (book.provider === "hardcover" && existing.provider !== "hardcover") ||
      (book.readersCount || 0) > (existing.readersCount || 0) ||
      ((book.readersCount || 0) === (existing.readersCount || 0) &&
        (book.ratingsCount || 0) > (existing.ratingsCount || 0));
    seen.set(
      key,
      preferNew ? mergeBooks(book, existing) : mergeBooks(existing, book)
    );
  }
  return order.map((key) => seen.get(key)!);
}

/**
 * Score a search hit for relevance against the query string.
 * Higher is more relevant. Negative scores are possible for poor matches.
 *
 * Popularity (readers / ratings) is a first-class signal so well-known novels
 * outrank title-exact trivia, pop-ups, and low-traffic catalog shells.
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

  const stripLeadingArticle = (value: string) =>
    value.replace(/^(the|a|an)\s+/, "").trim();

  const normAuthor = (book.author || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Title signals (treat leading "a/the" as optional so "game of thrones"
  // strongly matches "A Game of Thrones").
  if (normTitle === normQuery || stripLeadingArticle(normTitle) === normQuery) {
    score += 100;
  } else if (
    normTitle.startsWith(normQuery) ||
    stripLeadingArticle(normTitle).startsWith(normQuery)
  ) {
    score += 60;
  } else if (normTitle.includes(normQuery)) {
    score += 30;
  }

  // Work title signals (canonical English title cross-match)
  if (
    normWorkTitle &&
    (normWorkTitle === normQuery || stripLeadingArticle(normWorkTitle) === normQuery)
  ) {
    score += 80;
  } else if (
    normWorkTitle &&
    (normWorkTitle.startsWith(normQuery) ||
      stripLeadingArticle(normWorkTitle).startsWith(normQuery))
  ) {
    score += 50;
  } else if (normWorkTitle && normWorkTitle.includes(normQuery)) {
    score += 20;
  }

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

  // Reader popularity — primary ranking boost for aggregate merge.
  // Use Hardcover-scale readersCount only. Goodreads ratingsCount is a different
  // metric (often 100× larger) and must not dominate multilingual search.
  if (book.readersCount && book.readersCount > 0) {
    score += Math.log10(book.readersCount + 1) * 35;
  } else if (book.ratingsCount && book.ratingsCount > 0) {
    // Mild local-catalog signal only when no reader metric exists.
    score += Math.log10(book.ratingsCount + 1) * 8;
  }

  // Compilations / derivatives are filtered elsewhere; still demote if present.
  if (isCompilationOrDerivativeTitle(book.title, book.workTitle)) {
    score -= 200;
  }

  // Extra-token penalty: titles much longer than the query tend to be sub-works
  const titleTokenCount = normTitle.split(" ").length;
  const queryTokenCount = normQuery.split(" ").length;
  if (titleTokenCount > queryTokenCount + 2) {
    score -= (titleTokenCount - queryTokenCount - 2) * 5;
  }

  // Prefer known authors over "Unknown Author" shells
  if (!book.author || book.author === "Unknown Author") {
    score -= 40;
  }

  return score;
}

/** Providers allowed to own work structure in search merge (not backup catalogs). */
function isPrimaryProvider(providerId?: string | null): boolean {
  if (!providerId) return false;
  return (
    providerId === "canonical" ||
    isTrustedStructuralProvider(providerId) ||
    isLiveStructuralProvider(providerId)
  );
}

/**
 * A search hit is structural only when it comes from Hardcover, the Goodreads
 * provider, or a canonical row linked to a trusted external id. Pure backup
 * (ISBNDB/OL) and untrusted canonical cache rows are not structural.
 */
function isStructuralSearchHit(book: NormalizedSearchBook): boolean {
  if (book.provider === "hardcover" || book.provider === "goodreads") return true;
  if (book.provider === "canonical") {
    return (book.sources || []).some((source) =>
      isTrustedStructuralProvider(source.title)
    );
  }
  return false;
}

/**
 * Merge two hits for the same work, prioritizing trusted structural providers
 * (canonical / goodreads-dataset / hardcover) for core work structure, and using
 * backup providers only to backfill missing fields.
 */
function mergeBooks(a: NormalizedSearchBook, b: NormalizedSearchBook): NormalizedSearchBook {
  const translators = Array.from(
    new Set([...(a.translators ?? []), ...(b.translators ?? [])].filter(Boolean))
  );
  const illustrators = Array.from(
    new Set([...(a.illustrators ?? []), ...(b.illustrators ?? [])].filter(Boolean))
  );
  const narrators = Array.from(
    new Set([...(a.narrators ?? []), ...(b.narrators ?? [])].filter(Boolean))
  );

  // Hardcover wins ties over dataset/canonical when both are primary.
  const rank = (provider?: string | null) => {
    if (provider === "hardcover") return 3;
    if (provider === "goodreads" || provider === "canonical") return 2;
    if (isPrimaryProvider(provider)) return 1;
    return 0;
  };
  const aRank = rank(a.provider);
  const bRank = rank(b.provider);
  const primaryHit = aRank >= bRank ? a : b;
  const secondaryHit = primaryHit === a ? b : a;

  const rawGenres = [...(a.genres ?? []), ...(b.genres ?? [])];
  const cleanGenres = normalizeAndRankCategories(rawGenres, 5);

  const cover = pickBestCoverUrl([a.cover, b.cover, a.edition?.cover, b.edition?.cover]);
  const isbn = primaryHit.isbn || secondaryHit.isbn || null;
  const isbn10 = primaryHit.isbn10 || secondaryHit.isbn10 || null;
  const publicationDate = primaryHit.publicationDate || secondaryHit.publicationDate || undefined;
  const { language, languageCode } = languageFieldsFromParts(
    primaryHit.language || secondaryHit.language,
    primaryHit.languageCode || secondaryHit.languageCode
  );
  const rawRating = primaryHit.rating ?? secondaryHit.rating;
  const rating = roundRating(rawRating) ?? undefined;
  const readersCount = Math.max(
    primaryHit.readersCount || 0,
    secondaryHit.readersCount || 0
  );
  const ratingsCount = Math.max(
    primaryHit.ratingsCount || 0,
    secondaryHit.ratingsCount || 0
  );

  return {
    id: primaryHit.id || secondaryHit.id,
    provider: primaryHit.provider,
    title: primaryHit.title || secondaryHit.title,
    workTitle: primaryHit.workTitle || secondaryHit.workTitle || primaryHit.title,
    author: primaryHit.author || secondaryHit.author,
    cover,
    rating,
    readersCount: readersCount > 0 ? readersCount : undefined,
    ratingsCount: ratingsCount > 0 ? ratingsCount : undefined,
    publicationDate,
    genres: cleanGenres.length > 0 ? cleanGenres : undefined,
    isbn,
    isbn10,
    language,
    languageCode,
    translators: translators.length > 0 ? translators : undefined,
    illustrators: illustrators.length > 0 ? illustrators : undefined,
    narrators: narrators.length > 0 ? narrators : undefined,
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
      language: languageFields(
        m.languageCode ?? m.language ?? m.edition?.languageCode ?? m.edition?.language
      ).languageCode,
      format: toApiBookFormat(m.edition?.format),
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

  // Prefer non-compilation hits; only keep compilations if nothing else matches.
  const nonDerivatives = books.filter(
    (book) => !isCompilationOrDerivativeTitle(book.title, book.workTitle)
  );
  const pool = nonDerivatives.length > 0 ? nonDerivatives : books;

  // Score every hit before grouping so we can pick the best representative
  const scored = pool.map((book) => ({
    book,
    score: scoreRelevance(book, query),
  }));

  // Resolve work keys concurrently
  const resolutions = await resolveWorkKeys(pool);

  // Group by work key, tracking scores
  const groups = new Map<
    string,
    { representative: NormalizedSearchBook; bestScore: number; members: NormalizedSearchBook[] }
  >();

  for (let i = 0; i < pool.length; i++) {
    const { book, score } = scored[i];
    const { workKey } = resolutions[i];

    const existing = groups.get(workKey);
    if (!existing) {
      groups.set(workKey, { representative: book, bestScore: score, members: [book] });
    } else {
      existing.members.push(book);
      existing.representative = mergeBooks(existing.representative, book);
      // Keep the higher relevance score for the group; also prefer the member
      // with more readers as the representative base when scores are close.
      if (
        score > existing.bestScore ||
        (score === existing.bestScore &&
          (book.readersCount || book.ratingsCount || 0) >
            (existing.representative.readersCount ||
              existing.representative.ratingsCount ||
              0))
      ) {
        existing.bestScore = Math.max(existing.bestScore, score);
        if ((book.readersCount || 0) > (existing.representative.readersCount || 0)) {
          existing.representative = mergeBooks(book, existing.representative);
        }
      }
    }
  }

  // Trusted structural hits (Hardcover / dataset-linked canonical) gate whether
  // backup-only works may appear as standalone results.
  const hasPrimaryHits = pool.some((b) => isStructuralSearchHit(b));

  // Build final results: attach editions[], sort by group bestScore
  const results: Array<{ result: NormalizedSearchBook; score: number }> = [];

  for (const { representative, bestScore, members } of groups.values()) {
    // If structural hits exist, drop pure backup-only groups.
    const hasPrimaryMember = members.some((m) => isStructuralSearchHit(m));
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

    const primaryMember =
      members.find((m) => m.provider === "hardcover") ||
      members.find((m) => isStructuralSearchHit(m));
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

    // Pick best cover across all members in the work group (Hardcover > non-Goodreads > Goodreads)
    const allMemberCovers = members.flatMap((m) => [m.cover, m.edition?.cover, ...(m.editions?.map((e) => e.cover) || [])]);
    const bestGroupCover = pickBestCoverUrl(allMemberCovers);
    if (bestGroupCover) {
      finalRepresentative.cover = bestGroupCover;
    }

    finalRepresentative.rating = roundRating(finalRepresentative.rating) ?? undefined;
    // Carry the best popularity stats from the group for final ranking.
    const bestReaders = Math.max(
      0,
      ...members.map((m) => m.readersCount || 0),
      finalRepresentative.readersCount || 0
    );
    const bestRatings = Math.max(
      0,
      ...members.map((m) => m.ratingsCount || 0),
      finalRepresentative.ratingsCount || 0
    );
    if (bestReaders > 0) finalRepresentative.readersCount = bestReaders;
    if (bestRatings > 0) finalRepresentative.ratingsCount = bestRatings;

    const resolvedLang = languageFieldsFromParts(
      finalRepresentative.language,
      finalRepresentative.languageCode
    );
    finalRepresentative.language = resolvedLang.language;
    finalRepresentative.languageCode = resolvedLang.languageCode;

    const editions = buildEditionsArray(members);
    // Re-score after merge so popularity on the representative counts fully.
    const finalScore = scoreRelevance(finalRepresentative, query);
    results.push({
      result: editions ? { ...finalRepresentative, editions } : finalRepresentative,
      score: Math.max(bestScore, finalScore),
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const bReaders = b.result.readersCount || b.result.ratingsCount || 0;
    const aReaders = a.result.readersCount || a.result.ratingsCount || 0;
    return bReaders - aReaders;
  });

  const ranked = results.map((r) => r.result);
  return applyReaderPopularityFloor(ranked);
}

/**
 * When a clear high-traffic primary exists, drop low-reader noise (pop-ups,
 * catalog shells, trivia books that only share the title string).
 *
 * Important: use **readersCount only** (Hardcover users_count scale). Do not
 * mix in Goodreads ratingsCount (often millions) — that set the floor so high
 * that legitimate Spanish Hardcover hits (~10k users) were wiped after a local
 * hit with 1.8M ratings.
 */
export function applyReaderPopularityFloor(
  books: NormalizedSearchBook[]
): NormalizedSearchBook[] {
  if (books.length <= 1) return books;
  const readerOf = (book: NormalizedSearchBook) => book.readersCount || 0;
  const withReaders = books.filter((book) => readerOf(book) > 0);
  // If nobody has a comparable reader metric, keep the list intact.
  if (withReaders.length === 0) return books;

  const maxReaders = Math.max(...withReaders.map(readerOf));
  // Only apply when something is clearly popular on the readers scale.
  if (maxReaders < 500) return books;
  const floor = Math.max(25, Math.floor(maxReaders * 0.02));

  const filtered = books.filter((book) => {
    const readers = readerOf(book);
    // Keep books that lack readersCount (local-only) if they have solid ratings;
    // they are not on the same scale as the floor.
    if (readers <= 0) return (book.ratingsCount || 0) > 0 || Boolean(book.rating);
    return readers >= floor;
  });
  return filtered.length > 0 ? filtered : books;
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
 * Local search hits only short-circuit when linked to a trusted structural
 * source (Hardcover / Goodreads dataset). ISBNDB-only cache rows never win.
 */
function isLocalWorkComplete(book: NormalizedSearchBook): boolean {
  if (isGoodreadsCoverUrl(book.cover)) return false;
  return isTrustedLocalSearchComplete(book);
}

function hasSuspiciousForeignPresentation(
  book: NormalizedSearchBook,
  query: string
): boolean {
  const selectedLanguage = toIso639_1(book.languageCode || book.language);
  if (!selectedLanguage || selectedLanguage === "en") return false;

  const queryMatchesWork =
    normalizeSearchText(query) === normalizeSearchText(book.workTitle || book.title);
  const hasEnglishEdition = (book.editions || []).some(
    (edition) => toIso639_1(edition.language) === "en"
  );

  return queryMatchesWork && !hasEnglishEdition;
}

export async function searchAggregate(
  input: BookSearchInput
): Promise<NormalizedSearchResponse> {
  const targetLanguage = input.language ? toIso639_1(input.language) : null;
  const isIsbnQuery = isIsbnIdentitySearch(input.query);
  let localBooks: NormalizedSearchBook[] = [];
  // Postgres is the canonical read-through store. A local hit is complete for
  // this request and avoids spending provider quota or adding network latency —
  // but only when the results pass a completeness threshold.
  try {
    localBooks = await searchCanonicalBooks(input);
    const matchingLocalBooks = targetLanguage && !isIsbnQuery
      ? localBooks.filter(
          (book) =>
            toIso639_1(book.languageCode || book.language) === targetLanguage
        )
      : localBooks;
    const usableLocalBooks = targetLanguage
      ? matchingLocalBooks
      : matchingLocalBooks.filter(
          (book) => !hasSuspiciousForeignPresentation(book, input.query)
        );
    const rejectedIncompletePresentation =
      usableLocalBooks.length !== matchingLocalBooks.length;
    localBooks = usableLocalBooks
      .filter(
        (book) => !isCompilationOrDerivativeTitle(book.title, book.workTitle)
      )
      .sort((a, b) => scoreRelevance(b, input.query) - scoreRelevance(a, input.query));
    localBooks = applyReaderPopularityFloor(localBooks);
    // ISBN lookups can short-circuit on a complete local row. Free-text title
    // searches always consult Hardcover so reader-popularity ranking can promote
    // the primary novel over local noise / low-traffic title collisions.
    const allComplete =
      !rejectedIncompletePresentation &&
      localBooks.length > 0 &&
      localBooks.every(isLocalWorkComplete);
    if (allComplete && isIsbnQuery) {
      const books = localBooks.slice(0, input.limit);
      return {
        success: true,
        provider: "aggregate",
        results: {
          query: input.query,
          totalResults: books.length,
          books,
        },
      };
    }
  } catch (error) {
    console.error("Canonical book search failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  // Live structural authority is Hardcover only. The goodreads provider re-reads
  // the same Postgres catalog already queried above and must not outrank HC.
  const primaryProviders = providers.filter((provider) =>
    isLiveStructuralProvider(provider.id)
  );
  const backupProviders = providers.filter((provider) => isBackupProvider(provider.id));
  const primarySettled = await Promise.allSettled(primaryProviders.map((p) => p.search(input)));

  const books: NormalizedSearchBook[] = [...localBooks];
  let lastError: Error | null = null;

  for (let i = 0; i < primarySettled.length; i++) {
    const result = primarySettled[i];
    const provider = primaryProviders[i];
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

  // Backup providers enrich trusted structure only; never introduce standalone works.
  const primaryBooks = books.filter((book) => isPrimaryProvider(book.provider));
  const needsBackup =
    books.length > 0 &&
    primaryBooks.length > 0 &&
    books.some(
      (book) =>
        !book.isbn ||
        !book.cover ||
        isGoodreadsCoverUrl(book.cover) ||
        !book.publicationDate ||
        !book.language
    );
  let backupSettled: PromiseSettledResult<NormalizedSearchBook[]>[] = [];
  if (needsBackup) {
    backupSettled = await Promise.allSettled(backupProviders.map((p) => p.search(input)));
    for (let i = 0; i < backupSettled.length; i++) {
      const result = backupSettled[i];
      if (result.status === "fulfilled") books.push(...result.value);
      else lastError = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
  } else if (books.length === 0) {
    // No trusted hits at all — last resort search via backup catalogs.
    backupSettled = await Promise.allSettled(backupProviders.map((p) => p.search(input)));
    for (const result of backupSettled) {
      if (result.status === "fulfilled") books.push(...result.value);
      else lastError = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
  }

  if (books.length === 0) {
    if (
      lastError &&
      primarySettled.every((result) => result.status === "rejected") &&
      (backupSettled.length === 0 || backupSettled.every((r) => r.status === "rejected"))
    ) {
      throw lastError;
    }
    return {
      success: true,
      provider: "aggregate",
      results: { query: input.query, totalResults: 0, books: [] },
    };
  }

  const exactQueryIsbn = normalizeIsbn(input.query);
  const exactIsbnCandidates = exactQueryIsbn
    ? books.filter((book) => [
        book.isbn,
        book.isbn10,
        book.edition?.isbn,
        book.edition?.isbn10,
        ...(book.editions || []).flatMap((edition) => [edition.isbn, edition.isbn10]),
      ].some((value) => normalizeIsbn(value) === exactQueryIsbn))
    : [];
  // An exact Hardcover edition is stronger evidence than a bulk-dataset row,
  // which may occasionally carry an ISBN copied onto the wrong work.
  const hardcoverExactCandidates = exactIsbnCandidates.filter((book) => book.provider === "hardcover");
  const structuralCandidates = exactQueryIsbn
    ? (hardcoverExactCandidates.length > 0 ? hardcoverExactCandidates : exactIsbnCandidates)
    : books;
  const merged = await groupAndMergeByWork(structuralCandidates, input.query);

  // Prioritize hits matching language preference or ISBNDB hits when searching by ISBN
  const cleanQueryIsbn = exactQueryIsbn;
  const targetIso1 = targetLanguage;

  // `language` is a filter, not merely a ranking hint. Providers which cannot
  // prove the language of a hit must not leak a default English work into the
  // response. ISBN queries identify a specific edition and skip this filter.
  const languageFiltered = targetIso1 && !exactQueryIsbn
    ? merged.filter(
        (book) => toIso639_1(book.languageCode || book.language) === targetIso1
      )
    : merged;

  languageFiltered.sort((a, b) => {
    if (cleanQueryIsbn || input.type === "isbn") {
      const aIsbndb = a.provider === "isbndb" || a.isbn === cleanQueryIsbn || a.isbn10 === cleanQueryIsbn ? 1 : 0;
      const bIsbndb = b.provider === "isbndb" || b.isbn === cleanQueryIsbn || b.isbn10 === cleanQueryIsbn ? 1 : 0;
      if (aIsbndb !== bIsbndb) return bIsbndb - aIsbndb;
    }

    // Always re-rank by relevance + readers after language filtering. Otherwise
    // local Spanish hits (huge Goodreads ratings) float above the full series
    // of popular Hardcover Spanish editions in arbitrary order.
    const scoreDiff =
      scoreRelevance(b, input.query) - scoreRelevance(a, input.query);
    if (scoreDiff !== 0) return scoreDiff;
    const readersDiff = (b.readersCount || 0) - (a.readersCount || 0);
    if (readersDiff !== 0) return readersDiff;
    return (b.ratingsCount || 0) - (a.ratingsCount || 0);
  });

  // Collapse accent/title variants of the same work that failed work-key merge
  // (e.g. "Orden del Fénix" vs "Orden del Fenix").
  const dedupedByWorkTitle = dedupeSearchBooksByWorkTitle(languageFiltered);

  const finalBooks = dedupedByWorkTitle.slice(0, input.limit);

  // If every provider failed and we have no books, surface the error.
  if (finalBooks.length === 0 && lastError && primarySettled.every((r) => r.status === "rejected")) {
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
      language: b.languageCode || toIso639_1(b.language) || input.language,
      publicationDate: b.publicationDate,
      isbn10: b.isbn10 || b.edition?.isbn10,
      isbn13: b.isbn || b.edition?.isbn,
      asin: b.edition?.asin,
      providerEditionId: b.edition?.id ? String(b.edition.id) : undefined,
      publisher: b.edition?.publisher,
      pages: b.edition?.pages || undefined,
      format: b.edition?.format,
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

/**
 * Normalize a provider's translator list to the shape the merger expects.
 * Hardcover returns HardcoverContributor[] (objects), search results return
 * string[].  Both formats are accepted here.
 */
function normalizeTranslatorList(
  translators: unknown
): Array<{ name: string }> | undefined {
  if (!Array.isArray(translators) || translators.length === 0) return undefined;
  const result = translators
    .map((t) =>
      typeof t === "string" && t.trim()
        ? { name: t.trim() }
        : t && typeof (t as any).name === "string" && (t as any).name.trim()
        ? { name: (t as any).name.trim() }
        : null
    )
    .filter((t): t is { name: string } => t !== null);
  return result.length > 0 ? result : undefined;
}

/**
 * Ingest a provider details payload into the canonical store.
 * Structural providers may write identity fields; backups should only fill gaps.
 */
async function ingestDetailsBook(
  providerId: ProviderId,
  input: BookDetailsInput,
  book: Record<string, any>,
  options?: {
    /** When true, only write fields that fill holes (no title/author/genres/series). */
    gapFillOnly?: boolean;
    descriptionOverride?: string | null;
  }
): Promise<void> {
  if (!book) return;
  const gapFillOnly = Boolean(options?.gapFillOnly);
  const seriesRaw =
    typeof book.series === "string"
      ? book.series
      : book.series?.name || book.seriesName || null;
  const parsedSeries = parseSeriesLabel(
    typeof seriesRaw === "string" ? seriesRaw : null
  );
  const seriesName = gapFillOnly
    ? undefined
    : parsedSeries.name ||
      (typeof book.series === "string"
        ? book.series.replace(/\s*#\d+.*$/, "").trim()
        : book.series?.name || book.seriesName) ||
      undefined;
  const seriesPosition = gapFillOnly
    ? undefined
    : book.series?.position ?? book.seriesPosition ?? parsedSeries.position ?? undefined;

  const workTitle =
    book.workTitle || book.canonicalTitle || book.originalTitle || book.title || "";
  // Prefer work title over Amazon-style edition titles that embed series.
  const presentationTitle = gapFillOnly
    ? String(workTitle || book.title || "Untitled")
    : String(book.title || workTitle || "");

  await upsertCanonicalWorkFromProvider({
    provider: providerId,
    providerWorkId: String(book.id || book.slug || input.slug),
    title: presentationTitle,
    originalTitle: gapFillOnly ? undefined : String(workTitle || presentationTitle || ""),
    authorName: gapFillOnly ? undefined : extractPrimaryAuthorName(book.author) || undefined,
    description: String(
      options?.descriptionOverride || book.description || ""
    ),
    language: String(book.languageCode || book.language || input.language || ""),
    publicationYear: book.publicationYear || book.originalPublicationYear,
    publicationDate: String(book.publicationDate || book.publishDate || ""),
    publisher: String(
      book.publishedBy || book.publisher || book.edition?.publisher || ""
    ),
    pages:
      typeof book.pages === "number"
        ? book.pages
        : book.edition?.pages,
    audioLengthMinutes:
      typeof book.audioLengthMinutes === "number"
        ? book.audioLengthMinutes
        : book.edition?.audioLengthMinutes,
    isbn10: book.isbn10 || book.edition?.isbn10,
    isbn13: book.isbn13 || book.isbn || book.edition?.isbn,
    asin: book.asin || book.edition?.asin,
    format: book.type || book.bookEdition || book.format || book.edition?.format,
    coverUrl: book.coverUrl || book.cover || book.image || book.edition?.cover,
    country: book.country || book.edition?.country || null,
    countryCode: book.countryCode || book.edition?.countryCode || null,
    providerEditionId: book.edition?.id != null ? String(book.edition.id) : undefined,
    rating:
      typeof book.rating === "number"
        ? book.rating
        : typeof book.rating === "string"
          ? parseFloat(book.rating) || undefined
          : undefined,
    ratingsCount:
      typeof book.ratingsCount === "number"
        ? book.ratingsCount
        : parseInt(String(book.ratingCount || book.ratings_count || ""), 10) ||
          undefined,
    reviewsCount:
      typeof book.reviewsCount === "number"
        ? book.reviewsCount
        : parseInt(String(book.reviews_count || ""), 10) || undefined,
    genres: gapFillOnly ? undefined : book.genres,
    seriesName,
    seriesPosition: typeof seriesPosition === "number" ? seriesPosition : undefined,
    translators: gapFillOnly ? undefined : normalizeTranslatorList(book.translators),
    illustrators: gapFillOnly ? undefined : normalizeTranslatorList(book.illustrators),
    narrators: gapFillOnly ? undefined : normalizeTranslatorList(book.narrators),
    editions: Array.isArray(book.editions)
      ? book.editions.map((ed: any) => ({
          providerEditionId:
            ed.id != null
              ? String(ed.id)
              : ed.providerEditionId
                ? String(ed.providerEditionId)
                : undefined,
          isbn10: ed.isbn10 || ed.isbn_10,
          isbn13: ed.isbn || ed.isbn13 || ed.isbn_13,
          asin: ed.asin,
          title: ed.title,
          format: ed.format || ed.edition_format,
          language:
            ed.languageCode ||
            (typeof ed.language === "string" ? ed.language : ed.language?.code2) ||
            null,
          publisher: ed.publisher,
          publicationDate: ed.publicationDate || ed.release_date,
          pages: ed.pages,
          coverUrl: ed.cover || ed.coverUrl,
          country: ed.country || null,
          countryCode: ed.countryCode || null,
        }))
      : undefined,
  });
}

function extractMatchingDescription(book: any, targetIso: string | null): string | null {
  if (!book) return null;
  const texts: string[] = [];
  if (typeof book.description === "string" && book.description.trim()) {
    texts.push(book.description.trim());
  }
  if (Array.isArray(book.translations)) {
    for (const translation of book.translations) {
      if (typeof translation?.description === "string" && translation.description.trim()) {
        texts.push(translation.description.trim());
      }
    }
  }
  for (const text of texts) {
    if (!targetIso || isTextInLanguage(text, targetIso)) return text;
  }
  return null;
}

function pickDetailsDescription(
  targetIso: string | null,
  hardcoverBook: any,
  backupBooks: Array<{ book: any; providerId: string }>,
  localWork: any
): string | null {
  const canonicalCandidate = localWork
    ? {
        book: {
          description: localWork.translations?.find((t: any) => t.description)?.description,
          translations: localWork.translations,
        },
        providerId: "canonical",
      }
    : null;
  const hardcoverCandidate = hardcoverBook
    ? { book: hardcoverBook, providerId: "hardcover" }
    : null;

  const localizedOrder =
    targetIso && targetIso !== "en"
      ? [...backupBooks, canonicalCandidate, hardcoverCandidate]
      : [hardcoverCandidate, ...backupBooks, canonicalCandidate];

  for (const candidate of localizedOrder) {
    const match = extractMatchingDescription(candidate?.book, targetIso);
    if (match) {
      const cleaned = stripAlternateCoverNotes(match);
      if (cleaned.trim()) return cleaned.trim();
    }
  }

  // Hardcover English (or any remaining text) is the fallback.
  for (const candidate of [hardcoverCandidate, ...backupBooks, canonicalCandidate]) {
    const text =
      typeof candidate?.book?.description === "string"
        ? candidate.book.description.trim()
        : "";
    if (text) {
      const cleaned = stripAlternateCoverNotes(text);
      if (cleaned.trim()) return cleaned.trim();
    }
  }
  return null;
}

export async function getDetailsAggregate(
  input: BookDetailsInput
): Promise<NormalizedBookDetailsResponse> {
  const requestedIsbn = normalizeLookupIsbn(input.slug);
  let localWork: any = null;
  try {
    localWork = await findCanonicalWork(input.slug);
    if (localWork) {
      const matchedEditionByIsbn = findEditionByIsbn(localWork, requestedIsbn);
      const descriptionLanguage = resolveDetailsDescriptionLanguage({
        requestedLanguage: input.language,
        matchedEditionLanguage: matchedEditionByIsbn?.language,
        originalLanguage: localWork.originalLanguage,
      });
      const isNonEnglishEditionRequest =
        matchedEditionByIsbn &&
        toIso639_1((matchedEditionByIsbn as any).language) !== "en";
      const hasEditionTranslators =
        !isNonEnglishEditionRequest ||
        (localWork.contributors || []).some((c: any) => c.role === "TRANSLATOR");

      // Only short-circuit trusted, complete local rows (Hardcover / Goodreads
      // dataset). Missing translated synopses still go to backups.
      if (
        isTrustedLocalDetailsComplete(localWork) &&
        hasEditionTranslators &&
        !needsLocalizedDescriptionLookup(
          localWork,
          descriptionLanguage,
          Boolean(requestedIsbn)
        )
      ) {
        return canonicalWorkToDetails(localWork, input.language, input.slug);
      }
    }
  } catch (error) {
    console.error("Canonical detail lookup failed; falling back to providers:", error);
  }

  ensureProvidersConfigured();

  const providers = listAvailableProviders();
  const hardcoverProvider = providers.find((p) => p.id === "hardcover");
  const backupProviders = providers.filter((p) => isBackupProvider(p.id));

  // 1) Hardcover first — sole live structural authority.
  let hardcoverResult: NormalizedBookDetailsResponse | null = null;
  let hardcoverError: Error | null = null;
  if (hardcoverProvider?.isAvailable()) {
    try {
      hardcoverResult = await hardcoverProvider.getDetails(input);
    } catch (err) {
      hardcoverError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[DetailsAggregate] Hardcover details failed for "${input.slug}": ${hardcoverError.message}`
      );
    }
  }

  const hardcoverBook: any = hardcoverResult?.book || null;
  const matchedLocalEdition = findEditionByIsbn(localWork, requestedIsbn);
  let targetIso = resolveDetailsDescriptionLanguage({
    requestedLanguage: input.language,
    matchedEditionLanguage: matchedLocalEdition?.language,
    hardcoverLanguage: languageFromDetailsBook(hardcoverBook),
    originalLanguage: localWork?.originalLanguage,
  });

  // 2) Backups when Hardcover is missing fields, or when a non-English
  //    presentation still needs a translated synopsis.
  const hardcoverMissingCritical =
    !hardcoverBook ||
    !hardcoverBook.description ||
    !(hardcoverBook.isbn || hardcoverBook.isbn13 || hardcoverBook.edition?.isbn) ||
    !hardcoverBook.pages;
  const needsBackup =
    !hardcoverBook ||
    hardcoverMissingCritical ||
    needsLocalizedDescriptionLookup(localWork, targetIso, Boolean(requestedIsbn));

  const backupSettled = needsBackup
    ? await Promise.allSettled(backupProviders.map((p) => p.getDetails(input)))
    : [];
  type BackupHit = {
    res: PromiseFulfilledResult<NormalizedBookDetailsResponse>;
    provider: (typeof backupProviders)[number];
  };
  const backupFulfilled: BackupHit[] = backupSettled
    .map((res, idx) => ({ res, provider: backupProviders[idx] }))
    .filter((item): item is BackupHit => item.res.status === "fulfilled");

  const hasLocalizedBackup = () =>
    Boolean(targetIso) &&
    targetIso !== "en" &&
    backupFulfilled.some((item) =>
      extractMatchingDescription(item.res.value.book, targetIso)
    );

  // If the requested ISBN has no translated synopsis, try other same-language
  // editions of this work (ISBNdb stores synopsis per ISBN).
  if (
    needsBackup &&
    targetIso &&
    targetIso !== "en" &&
    !hasLocalizedBackup() &&
    !workHasDescriptionInLanguage(localWork, targetIso)
  ) {
    const extraIsbns = siblingIsbnsForLanguage(localWork, targetIso, requestedIsbn, 3).filter(
      (isbn) => isbn !== requestedIsbn
    );
    for (const isbn of extraIsbns) {
      const extraSettled = await Promise.allSettled(
        backupProviders.map((provider) => provider.getDetails({ slug: isbn }))
      );
      for (let idx = 0; idx < extraSettled.length; idx++) {
        const res = extraSettled[idx];
        if (res.status !== "fulfilled") continue;
        backupFulfilled.push({ res, provider: backupProviders[idx] });
      }
      targetIso =
        resolveDetailsDescriptionLanguage({
          requestedLanguage: input.language,
          matchedEditionLanguage: matchedLocalEdition?.language,
          backupBookLanguages: backupFulfilled.map((item) =>
            languageFromDetailsBook(item.res.value.book)
          ),
          hardcoverLanguage: languageFromDetailsBook(hardcoverBook),
          originalLanguage: localWork?.originalLanguage,
        }) || targetIso;
      if (hasLocalizedBackup()) break;
    }
  } else if (backupFulfilled.length > 0) {
    targetIso =
      resolveDetailsDescriptionLanguage({
        requestedLanguage: input.language,
        matchedEditionLanguage: matchedLocalEdition?.language,
        backupBookLanguages: backupFulfilled.map((item) =>
          languageFromDetailsBook(item.res.value.book)
        ),
        hardcoverLanguage: languageFromDetailsBook(hardcoverBook),
        originalLanguage: localWork?.originalLanguage,
      }) || targetIso;
  }

  if (!hardcoverResult && backupFulfilled.length === 0 && !localWork) {
    throw (
      hardcoverError ||
      (backupSettled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)
        ?.reason ||
      new Error("No provider could resolve book details")
    );
  }

  // 3) Description: translated backups first, Hardcover English as fallback.
  const backupBooks = backupFulfilled.map((item) => ({
    book: item.res.value.book || {},
    providerId: item.provider.id,
  }));
  let description = pickDetailsDescription(
    targetIso,
    hardcoverBook,
    backupBooks,
    localWork
  );
  const descriptionIsLocalized = Boolean(
    description && targetIso && targetIso !== "en" && isTextInLanguage(description, targetIso)
  );

  // 4) Ingest: Hardcover structural write first (repairs poison), then gap-fill.
  //    Do not write a translated synopsis through the Hardcover row — that
  //    language is often English even when the edition is not.
  if (hardcoverBook) {
    try {
      await ingestDetailsBook("hardcover", input, hardcoverBook);
    } catch (err) {
      console.error("Canonical hardcover detail ingest error:", err);
    }
  }

  const existingLocalizedTitle =
    targetIso && localWork
      ? localWork.translations?.find((t: any) => toIso639_1(t.language) === targetIso)
          ?.title
      : null;

  for (const item of backupFulfilled) {
    const b: any = item.res.value.book || {};
    const backupDesc =
      typeof b.description === "string" && b.description.trim()
        ? b.description.trim()
        : "";
    const backupIsLocalized = Boolean(
      targetIso &&
        targetIso !== "en" &&
        backupDesc &&
        isTextInLanguage(backupDesc, targetIso)
    );

    if (hardcoverBook) {
      const needsGap =
        !(hardcoverBook.pages || hardcoverBook.edition?.pages) ||
        !(hardcoverBook.publisher || hardcoverBook.publishedBy) ||
        !(hardcoverBook.cover || hardcoverBook.coverUrl || hardcoverBook.image);
      if (!needsGap && !backupIsLocalized) continue;
      try {
        await ingestDetailsBook(
          item.provider.id,
          input,
          backupIsLocalized
            ? {
                ...b,
                title: existingLocalizedTitle || b.title,
                language: targetIso,
                languageCode: targetIso,
              }
            : b,
          {
            gapFillOnly: true,
            descriptionOverride: backupIsLocalized
              ? backupDesc
              : !hardcoverBook.description
                ? description
                : undefined,
          }
        );
      } catch (err) {
        console.error(`Canonical backup detail ingest error (${item.provider.id}):`, err);
      }
    } else {
      try {
        await ingestDetailsBook(item.provider.id, input, b, {
          descriptionOverride: description,
        });
      } catch (err) {
        console.error(`Canonical backup detail ingest error (${item.provider.id}):`, err);
      }
    }
  }

  // 5) Prefer re-read of the repaired canonical row for a stable response shape.
  try {
    const freshWork = await findCanonicalWork(input.slug);
    if (freshWork) {
      const result = canonicalWorkToDetails(freshWork, input.language, input.slug);
      const book = result.book as any;

      // Overlay live Hardcover structural fields when the re-read is still thin
      // (e.g. race on async cover rows) so clients never see ISBNDB identity.
      if (hardcoverBook) {
        const hcWorkTitle =
          hardcoverBook.workTitle || hardcoverBook.title || null;
        if (hardcoverBook.title && typeof hardcoverBook.title === "string") {
          book.title = hardcoverBook.title;
        }
        if (hcWorkTitle) {
          book.canonicalTitle = hcWorkTitle;
        }
        const hcAuthor = extractPrimaryAuthorName(hardcoverBook.author);
        if (hcAuthor) {
          book.author = hcAuthor;
          book.authors = Array.isArray(hardcoverBook.author)
            ? hardcoverBook.author
                .filter((a: any) => a?.name)
                .map((a: any, i: number) => ({
                  id: String(a.id ?? i),
                  name: a.name,
                  role: "AUTHOR",
                }))
            : [{ id: "0", name: hcAuthor, role: "AUTHOR" }];
        }
        if (hardcoverBook.rating != null) {
          const n =
            typeof hardcoverBook.rating === "number"
              ? hardcoverBook.rating
              : parseFloat(String(hardcoverBook.rating));
          if (Number.isFinite(n)) book.rating = roundRating(n);
        }
        if (hardcoverBook.ratingCount != null && hardcoverBook.ratingCount !== "") {
          const count = parseInt(String(hardcoverBook.ratingCount), 10);
          if (Number.isFinite(count)) book.ratingsCount = count;
        }
        const hcSeries = parseSeriesLabel(
          typeof hardcoverBook.series === "string" ? hardcoverBook.series : null
        );
        if (hcSeries.name) {
          if (!Array.isArray(book.series) || book.series.length === 0) {
            book.series = [
              {
                id: hardcoverBook.seriesURL || hcSeries.name,
                slug:
                  typeof hardcoverBook.seriesURL === "string"
                    ? hardcoverBook.seriesURL.split("/").pop() || null
                    : null,
                name: hcSeries.name,
                position: hcSeries.position,
                isPrimary: true,
              },
            ];
          } else if (hcSeries.position != null) {
            // Fill null positions left by the Goodreads import (always NULL).
            book.series = book.series.map((entry: any) => {
              const sameName =
                normalizeSearchText(entry?.name || "") ===
                normalizeSearchText(hcSeries.name || "");
              if (sameName && (entry.position == null || entry.position === "")) {
                return { ...entry, position: hcSeries.position };
              }
              return entry;
            });
          }
        }
        if (book.matchedEdition && hardcoverBook.asin) {
          book.matchedEdition.asin =
            book.matchedEdition.asin || hardcoverBook.asin || hardcoverBook.edition?.asin || null;
        }
        if (book.matchedEdition) {
          if (hardcoverBook.country && !book.matchedEdition.country) {
            book.matchedEdition.country = hardcoverBook.country;
          }
          if (hardcoverBook.countryCode && !book.matchedEdition.countryCode) {
            book.matchedEdition.countryCode = hardcoverBook.countryCode;
          }
          if (
            hardcoverBook.type ||
            hardcoverBook.bookEdition ||
            hardcoverBook.edition?.format
          ) {
            book.matchedEdition.format = toApiBookFormat(
              hardcoverBook.type ||
                hardcoverBook.bookEdition ||
                hardcoverBook.edition?.format
            );
          }
        }
        if (hardcoverBook.country && !book.country) book.country = hardcoverBook.country;
        if (hardcoverBook.countryCode && !book.countryCode) {
          book.countryCode = hardcoverBook.countryCode;
        }
        if (Array.isArray(book.editions) && hardcoverBook.asin) {
          book.editions = book.editions.map((ed: any) => ({
            ...ed,
            asin: ed.asin || hardcoverBook.asin || hardcoverBook.edition?.asin || null,
          }));
        }
        const hcCover =
          hardcoverBook.cover || hardcoverBook.coverUrl || hardcoverBook.edition?.cover;
        if (hcCover && book.matchedEdition) {
          const current = book.matchedEdition.cover || "";
          if (!current || current.includes("isbndb.com") || isGoodreadsCoverUrl(current)) {
            book.matchedEdition.cover = hcCover;
          }
        }
        if (Array.isArray(hardcoverBook.genres) && hardcoverBook.genres.length > 0) {
          book.genres = normalizeAndRankCategories(hardcoverBook.genres, 5);
        }
      }

      if (
        description &&
        (!book.description ||
          (descriptionIsLocalized &&
            book.descriptionLanguage !== targetIso))
      ) {
        book.description = description;
        book.descriptionLanguage = descriptionIsLocalized
          ? targetIso
          : isTextInLanguage(description, "en")
            ? "en"
            : targetIso || null;
        book.isLanguageFallback = Boolean(
          targetIso &&
            book.descriptionLanguage &&
            book.descriptionLanguage !== targetIso
        );
      }
      return result;
    }
  } catch (freshErr) {
    console.error("Fresh canonical details re-read failed:", freshErr);
  }

  // 6) Fallbacks when DB re-read is unavailable.
  if (localWork && isTrustedLocalDetailsComplete(localWork)) {
    return canonicalWorkToDetails(localWork, input.language, input.slug);
  }
  if (hardcoverResult) {
    return {
      success: true,
      provider: "aggregate",
      scrapedURL: hardcoverResult.scrapedURL,
      book: {
        ...hardcoverBook,
        description: description || hardcoverBook.description,
        provider: "hardcover",
      },
    };
  }
  if (backupFulfilled.length > 0) {
    const first = backupFulfilled[0];
    return {
      ...first.res.value,
      provider: "aggregate",
    };
  }
  if (localWork) {
    return canonicalWorkToDetails(localWork, input.language, input.slug);
  }

  throw hardcoverError || new Error("No provider could resolve book details");
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
          format: toApiBookFormat(edition.format),
          isbn: edition.isbn13,
          isbn10: edition.isbn10,
          asin: edition.asin,
          publicationDate: edition.publicationDate,
          pages: edition.pages,
          publisher: edition.publisher,
          ...languageFields(edition.language),
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
            provider: "canonical",
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
