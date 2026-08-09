import {
  getProvider,
  listAvailableProviders,
  listProviders,
} from "@/lib/providers/registry";
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
import { normalizeAndRankCategories } from "@/lib/canonical/constants";
import { getImageDimensions } from "@/lib/utils/image-size";
import { toIso639_1 } from "@/lib/languages";

function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return normalized.length === 10 || normalized.length === 13 ? normalized : null;
}

function titleAuthorKey(book: NormalizedSearchBook): string {
  return `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
}

function mergeBooks(a: NormalizedSearchBook, b: NormalizedSearchBook): NormalizedSearchBook {
  const translators = Array.from(
    new Set([...(a.translators ?? []), ...(b.translators ?? [])].filter(Boolean))
  );

  // Give preference to ISBNDB data for ISBNs, edition details, publisher, pages, format, title, author
  const isbndbHit = a.provider === "isbndb" ? a : b.provider === "isbndb" ? b : null;
  const otherHit = isbndbHit ? (isbndbHit === a ? b : a) : null;

  // Categories/Subjects: Prefer ISBNDB subjects if available, else combine, rank and cap to top 5
  const rawGenres = isbndbHit?.genres && isbndbHit.genres.length > 0
    ? isbndbHit.genres
    : [...(a.genres ?? []), ...(b.genres ?? [])];
  const cleanGenres = normalizeAndRankCategories(rawGenres, 5);

  if (isbndbHit) {
    const cover = isbndbHit.cover || otherHit?.cover || a.cover || b.cover;
    return {
      id: isbndbHit.id || otherHit?.id || a.id,
      provider: isbndbHit.provider,
      title: isbndbHit.title || otherHit?.title || a.title,
      workTitle: isbndbHit.workTitle || otherHit?.workTitle || a.workTitle,
      author: isbndbHit.author || otherHit?.author || a.author,
      cover: cover,
      rating: isbndbHit.rating ?? otherHit?.rating ?? a.rating,
      publicationDate: isbndbHit.publicationDate || otherHit?.publicationDate || a.publicationDate,
      genres: cleanGenres.length > 0 ? cleanGenres : undefined,
      isbn: isbndbHit.isbn || otherHit?.isbn || null,
      isbn10: isbndbHit.isbn10 || otherHit?.isbn10 || null,
      language: isbndbHit.language || otherHit?.language || null,
      languageCode: isbndbHit.languageCode || otherHit?.languageCode || null,
      translators: translators.length > 0 ? translators : undefined,
      presentation: isbndbHit.presentation || otherHit?.presentation || "isbn",
      confidence: isbndbHit.confidence ?? otherHit?.confidence,
      sources: Array.from(new Set([...(a.sources ?? []), ...(b.sources ?? [])])),
      edition: isbndbHit.edition || otherHit?.edition,
    };
  }

  const preferACover = Boolean(a.cover) && a.cover.length >= (b.cover?.length ?? 0);

  // Prefer the hit that already resolved a language-specific edition presentation.
  const preferAPresentation =
    (a.presentation === "edition" || a.presentation === "isbn") &&
    b.presentation !== "edition" &&
    b.presentation !== "isbn";

  return {
    id: a.id || b.id,
    provider: a.provider,
    title: preferAPresentation ? a.title || b.title : a.title || b.title,
    workTitle: a.workTitle || b.workTitle,
    author: a.author || b.author,
    cover: preferACover ? a.cover : b.cover || a.cover,
    rating: a.rating ?? b.rating,
    publicationDate: a.publicationDate || b.publicationDate,
    genres: cleanGenres.length > 0 ? cleanGenres : undefined,
    isbn: a.isbn ?? b.isbn ?? null,
    isbn10: a.isbn10 ?? b.isbn10 ?? null,
    language: a.language ?? b.language,
    languageCode: a.languageCode ?? b.languageCode,
    translators: translators.length > 0 ? translators : undefined,
    presentation: a.presentation || b.presentation,
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

export async function searchAggregate(
  input: BookSearchInput
): Promise<NormalizedSearchResponse> {
  const targetLanguage = input.language ? toIso639_1(input.language) : null;
  // Postgres is the canonical read-through store. A local hit is complete for
  // this request and avoids spending provider quota or adding network latency.
  try {
    const localBooks = await searchCanonicalBooks(input);
    const matchingLocalBooks = targetLanguage
      ? localBooks.filter(
          (book) =>
            toIso639_1(book.languageCode || book.language) === targetLanguage
        )
      : localBooks;
    if (matchingLocalBooks.length > 0) {
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

  const merged = dedupeSearchBooks(books);

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
    if (localWork) return canonicalWorkToDetails(localWork);
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

  // Prefer ISBNDB match if available for primary details
  const isbndbMatch = fulfilled.find((item) => item.provider.id === "isbndb");
  const primaryMatch = isbndbMatch || fulfilled[0];
  const otherMatches = fulfilled.filter((item) => item !== primaryMatch);

  const primaryBook: any = primaryMatch.res.value.book || {};
  const mergedBook: Record<string, unknown> = { ...primaryBook };

  // 1. Description / Synopsis: Prioritize ISBNDB synopsis/description when available
  let description = primaryBook.description;
  if (!description || typeof description !== "string" || !description.trim()) {
    for (const m of otherMatches) {
      const d = (m.res.value.book as any)?.description;
      if (typeof d === "string" && d.trim()) {
        description = d;
        break;
      }
    }
  }
  mergedBook.description = description || null;

  // 2. Publication Date
  let publicationDate = primaryBook.publicationDate || primaryBook.publishDate;
  if (!publicationDate) {
    for (const m of otherMatches) {
      const pd = (m.res.value.book as any)?.publicationDate || (m.res.value.book as any)?.publishDate;
      if (pd) {
        publicationDate = pd;
        break;
      }
    }
  }
  mergedBook.publicationDate = publicationDate || null;
  mergedBook.publishDate = publicationDate || null;

  // 3. Publisher
  let publisher = primaryBook.publisher || primaryBook.publishedBy;
  if (!publisher) {
    for (const m of otherMatches) {
      const p = (m.res.value.book as any)?.publisher || (m.res.value.book as any)?.publishedBy;
      if (p) {
        publisher = p;
        break;
      }
    }
  }
  mergedBook.publisher = publisher || null;
  mergedBook.publishedBy = publisher || null;

  // 4. Language
  let language = primaryBook.language;
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

  // 5. Pages
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

  // 6. Genres / Categories: Prefer ISBNDB subjects if available, else combine, rank and cap to top 5
  const rawGenresList: string[] = isbndbMatch
    ? ((isbndbMatch.res.value.book as any)?.genres || [])
    : fulfilled.flatMap((m) => (m.res.value.book as any)?.genres || []);

  const cleanGenres = normalizeAndRankCategories(rawGenresList, 5);
  mergedBook.genres = cleanGenres;

  // Background ingest into Prisma Canonical store
  for (const m of fulfilled) {
    const b: any = m.res.value.book;
    if (b) {
      upsertCanonicalWorkFromProvider({
        provider: m.provider.id,
        providerWorkId: String(b.id || input.slug),
        title: String(b.title || ""),
        originalTitle: b.originalTitle || b.workTitle,
        authorName: typeof b.author === "string" ? b.author : b.author?.name,
        description: String(mergedBook.description || b.description || ""),
        publicationYear: b.publicationYear || b.originalPublicationYear,
        publicationDate: String(mergedBook.publicationDate || b.publicationDate || ""),
        publisher: String(mergedBook.publisher || b.publisher || ""),
        pages: typeof mergedBook.pages === "number" ? mergedBook.pages : b.pages,
        isbn10: b.isbn10,
        isbn13: b.isbn13 || b.isbn,
        asin: b.asin,
        format: b.format,
        coverUrl: b.coverUrl || b.cover || b.image,
        rating: b.rating || b.averageRating,
        ratingsCount: b.ratingsCount,
        genres: cleanGenres,
        seriesName: b.series?.name || b.seriesName,
        seriesPosition: b.series?.position || b.seriesPosition,
      }).catch((err) => console.error("Canonical detail ingest error:", err));
    }
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
