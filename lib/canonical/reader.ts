import { prisma } from "@/lib/db";
import { formatAudioLength, isTextInLanguage, normalizeAuthorSlug, normalizeBookFormat, normalizeAndRankCategories, selectBestCover } from "@/lib/canonical/constants";
import type {
  BookSearchInput,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  SeriesDetailsInput,
} from "@/lib/providers/types";

const workInclude = {
  contributors: { include: { author: true }, orderBy: { position: "asc" as const } },
  seriesMemberships: { include: { series: { include: { translations: true } } } },
  translations: true,
  titles: true,
  editions: { include: { covers: true, externalIds: true } },
  genres: { include: { genre: true } },
  externalIds: true,
} as const;

function primaryAuthor(work: any): any | null {
  return (
    work.contributors?.find((item: any) => item.isPrimary)?.author ||
    work.contributors?.[0]?.author ||
    null
  );
}

function normalizedIsbn(value: string): string | null {
  const clean = value.replace(/[^0-9X]/gi, "").toUpperCase();
  return clean.length === 10 || clean.length === 13 ? clean : null;
}

function providerReference(work: any, edition?: any) {
  const mapping = (work.externalIds || []).find(
    (item: any) =>
      (item.provider === "hardcover" ||
        item.provider === "openlibrary" ||
        item.provider === "isbndb") &&
      item.externalId
  );

  if (mapping) {
    return {
      provider: mapping.provider as "hardcover" | "openlibrary" | "isbndb",
      id: String(mapping.externalId),
    };
  }

  // ISBNDB addresses book details by ISBN. Older canonical rows may predate
  // provider mappings, but their edition ISBN is still a valid details key.
  const isbn = edition?.isbn13 || edition?.isbn10;
  if (isbn) return { provider: "isbndb" as const, id: isbn };

  // Preserve the previous fallback for incomplete legacy rows. Aggregate
  // details can still resolve this canonical work id when the provider is not
  // explicitly pinned by a caller.
  return { provider: "isbndb" as const, id: work.id };
}

function cleanTitleForMatch(title: string): string {
  return title
    .replace(/\s*\([^)]*#\d+[^)]*\)/gi, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function preferredEdition(work: any, language?: string, isbn?: string | null, query?: string) {
  if (isbn) {
    const match = work.editions.find((edition: any) =>
      [edition.isbn13, edition.isbn10, edition.asin].includes(isbn)
    );
    if (match) return match;
  }

  if (language) {
    const match = work.editions.find((edition: any) => edition.language === language);
    if (match) return match;
  }

  if (query && query.trim()) {
    const normQuery = cleanTitleForMatch(query);

    if (normQuery.length >= 3) {
      const queryMatch = work.editions.find((edition: any) => {
        if (!edition.title) return false;
        const normTitle = cleanTitleForMatch(edition.title);
        return normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)));
      });
      if (queryMatch) return queryMatch;
    }
  }

  if (work.originalLanguage) {
    const origMatch = work.editions.find((edition: any) => edition.language === work.originalLanguage);
    if (origMatch) return origMatch;
  }

  return (
    work.editions.find((edition: any) => edition.isDefault) ||
    work.editions[0]
  );
}

function detectQueryLanguageMatch(work: any, query?: string): string | undefined {
  if (!query || !query.trim()) return undefined;
  const normQuery = cleanTitleForMatch(query);
  if (!normQuery || normQuery.length < 3) return undefined;

  // 1. Check translations
  for (const trans of work.translations || []) {
    if (trans.title) {
      const normTitle = cleanTitleForMatch(trans.title);
      if (normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)))) {
        return trans.language;
      }
    }
  }

  // 2. Check work titles
  for (const titleObj of work.titles || []) {
    if (titleObj.title) {
      const normTitle = cleanTitleForMatch(titleObj.title);
      if (normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)))) {
        return titleObj.language;
      }
    }
  }

  // 3. Check edition titles
  for (const ed of work.editions || []) {
    if (ed.title && ed.language) {
      const normTitle = cleanTitleForMatch(ed.title);
      if (normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)))) {
        return ed.language;
      }
    }
  }

  return undefined;
}

export function canonicalWorkToSearchBook(
  work: any,
  language?: string,
  isbn?: string | null,
  query?: string
): NormalizedSearchBook {
  const detectedLang = !language ? detectQueryLanguageMatch(work, query) : undefined;
  const effectiveLang = language || (detectedLang ? toIso639_1(detectedLang) : undefined);

  const edition = preferredEdition(work, effectiveLang, isbn, query);
  const coverObj = selectBestCover(edition?.covers) || selectBestCover(work.editions?.flatMap((e: any) => e.covers || []));
  const translation = effectiveLang
    ? work.translations.find((item: any) => toIso639_1(item.language) === effectiveLang || item.language === effectiveLang)
    : undefined;
  const providerReferenceForWork = providerReference(work, edition);
  const author = primaryAuthor(work);

  // Build compact editions[] array (up to 5 editions with ISBN identifiers)
  let editionsForSummary = work.editions;
  if (effectiveLang) {
    const langMatches = work.editions.filter(
      (ed: any) =>
        ed.language === effectiveLang ||
        ed.language === (effectiveLang === "es" ? "spa" : effectiveLang)
    );
    if (langMatches.length > 0) {
      editionsForSummary = langMatches;
    }
  }

  const editionSummaries: NonNullable<NormalizedSearchBook["editions"]> = editionsForSummary
    .filter((ed: any) => ed.isbn13 || ed.isbn10)
    .slice(0, 5)
    .map((ed: any) => {
      const edCoverObj = selectBestCover(ed.covers);
      return {
        isbn: ed.isbn13 ?? null,
        isbn10: ed.isbn10 ?? null,
        language: ed.language ?? null,
        format: ed.format?.toLowerCase() ?? null,
        publicationDate: ed.publicationDate ?? null,
        cover: edCoverObj?.url || undefined,
      };
    });

  let rawTitle = translation?.title || edition?.title || work.canonicalTitle;
  if (query && query.trim()) {
    const normQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    const normRaw = rawTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    const normCanonical = work.canonicalTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

    if (!normRaw.includes(normQuery) && normCanonical.includes(normQuery)) {
      rawTitle = work.canonicalTitle;
    }
  }
  const displayTitle = rawTitle.replace(/\s*\([^)]*#\d+[^)]*\)/gi, "").trim() || rawTitle;

  return {
    id: providerReferenceForWork.id,
    provider: providerReferenceForWork.provider,
    title: displayTitle,
    workTitle: work.canonicalTitle,
    author: author?.name || "Unknown Author",
    cover: coverObj?.url || "",
    rating: work.averageRating ?? undefined,
    publicationDate:
      edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : undefined),
    genres: normalizeAndRankCategories(
      work.genres.map((item: any) => item.genre.name),
      5
    ),
    isbn: edition?.isbn13 || edition?.isbn10 || null,
    isbn10: edition?.isbn10 || null,
    language: edition?.language || effectiveLang || work.originalLanguage || null,
    languageCode: edition?.language || effectiveLang || work.originalLanguage || null,
    presentation: isbn ? "isbn" : edition ? "edition" : "work",
    editions: editionSummaries.length > 0 ? editionSummaries : undefined,
    edition: edition
      ? {
          id: 0,
          title: edition.title,
          isbn: edition.isbn13,
          isbn10: edition.isbn10,
          asin: edition.asin,
          format: edition.format,
          publicationDate: edition.publicationDate,
          pages: edition.pages,
          publisher: edition.publisher,
          language: edition.language,
          languageCode: edition.language,
          country: null,
          countryCode: null,
          cover: coverObj?.url || "",
        }
      : undefined,
  };
}

export async function searchCanonicalBooks(
  input: BookSearchInput
): Promise<NormalizedSearchBook[]> {
  const query = input.query.trim();
  const isbn = normalizedIsbn(query);
  const titleMatch = {
    OR: [
      { canonicalTitle: { contains: query, mode: "insensitive" as const } },
      { titles: { some: { title: { contains: query, mode: "insensitive" as const } } } },
      { translations: { some: { title: { contains: query, mode: "insensitive" as const } } } },
      { editions: { some: { title: { contains: query, mode: "insensitive" as const } } } },
    ],
  };
  const authorMatch = {
    contributors: {
      some: { author: { name: { contains: query, mode: "insensitive" as const } } },
    },
  };
  const isbnMatch = isbn
    ? { editions: { some: { OR: [{ isbn13: isbn }, { isbn10: isbn }, { asin: isbn }] } } }
    : null;

  const where = isbnMatch
    ? isbnMatch
    : input.type === "author"
      ? authorMatch
      : input.type === "title"
        ? titleMatch
        : { OR: [titleMatch, authorMatch] };

  const works = await prisma.work.findMany({
    where,
    include: workInclude,
    orderBy: [{ ratingsCount: "desc" }, { averageRating: "desc" }],
    take: input.limit,
  });

  return works.map((work) => canonicalWorkToSearchBook(work, input.language, isbn, query));
}

export async function findCanonicalWork(identifier: string) {
  const value = identifier.trim();
  const isbn = normalizedIsbn(value);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  return prisma.work.findFirst({
    where: {
      OR: [
        ...(isUuid ? [{ id: value }] : []),
        { slug: value },
        { externalIds: { some: { externalId: value } } },
        ...(isbn
          ? [{ editions: { some: { OR: [{ isbn13: isbn }, { isbn10: isbn }, { asin: isbn }] } } }]
          : []),
      ],
    },
    include: workInclude,
  });
}

import { toIso639_1 } from "@/lib/languages";

export function canonicalWorkToDetails(
  work: any,
  language?: string,
  identifier?: string
): NormalizedBookDetailsResponse {
  const value = identifier?.trim();
  const isbn = value ? normalizedIsbn(value) : null;
  const targetIso = language ? toIso639_1(language) : null;
  const edition = preferredEdition(work, targetIso || undefined, isbn || value);
  const effectiveLang = edition?.language || targetIso || work.originalLanguage;
  const effectiveIso = effectiveLang ? toIso639_1(effectiveLang) : null;
  const author = primaryAuthor(work);
  const translation = effectiveIso
    ? work.translations.find((item: any) => toIso639_1(item.language) === effectiveIso)
    : work.translations[0];

  let description: string | null = null;
  if (effectiveIso) {
    const langTrans = work.translations?.find(
      (item: any) => toIso639_1(item.language) === effectiveIso && isTextInLanguage(item.description, effectiveIso)
    );
    if (langTrans) {
      description = langTrans.description.trim();
    }

    if (!description) {
      const langEd = work.editions?.find(
        (item: any) =>
          (toIso639_1(item.language) === effectiveIso || item.language === (effectiveIso === "es" ? "spa" : effectiveIso)) &&
          isTextInLanguage(item.description, effectiveIso)
      );
      if (langEd?.description) {
        description = langEd.description.trim();
      }
    }
  }

  if (!description) {
    const anyTrans = work.translations?.find((item: any) => item.description?.trim());
    if (anyTrans?.description) {
      description = anyTrans.description.trim();
    }
  }

  if (!description && edition?.description?.trim()) {
    description = edition.description.trim();
  }

  const rawTitle = translation?.title || edition?.title || work.canonicalTitle;
  const displayTitle = rawTitle.replace(/\s*\([^)]*#\d+[^)]*\)/gi, "").trim() || rawTitle;

  const normalizedMatchedEdition = edition
    ? {
        ...edition,
        format: normalizeBookFormat(edition.format),
      }
    : null;

  const normalizedEditions = (work.editions || []).map((ed: any) => ({
    ...ed,
    format: normalizeBookFormat(ed.format),
  }));

  function dedupeContributors(contributors: any[]) {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const c of contributors) {
      const name = c.author?.name || c.name || "";
      const slug = normalizeAuthorSlug(name);
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        result.push({
          id: c.author?.id || c.id || "0",
          name,
          role: c.role || "AUTHOR",
        });
      }
    }
    return result;
  }

  const authorsList = dedupeContributors((work.contributors || []).filter((c: any) => c.role === "AUTHOR"));
  const translatorsList = dedupeContributors((work.contributors || []).filter((c: any) => c.role === "TRANSLATOR"));
  const illustratorsList = dedupeContributors((work.contributors || []).filter((c: any) => c.role === "ILLUSTRATOR"));
  const narratorsList = dedupeContributors((work.contributors || []).filter((c: any) => c.role === "NARRATOR"));
  const editorsList = dedupeContributors((work.contributors || []).filter((c: any) => c.role === "EDITOR"));

  const audioInfo = formatAudioLength(
    typeof edition?.audioLengthMinutes === "number" ? edition.audioLengthMinutes * 60 : null
  );

  return {
    success: true,
    provider: "aggregate",
    scrapedURL: `canonical://work/${work.id}`,
    book: {
      id: work.id,
      slug: work.slug,
      title: displayTitle,
      canonicalTitle: work.canonicalTitle,
      description,
      language: effectiveLang || null,
      languageCode: effectiveLang || null,
      author: authorsList[0]?.name || author?.name || "Unknown Author",
      authors: authorsList.length > 0 ? authorsList : [{ id: author?.id || "0", name: author?.name || "Unknown Author", role: "AUTHOR" }],
      translators: translatorsList,
      illustrators: illustratorsList,
      narrators: narratorsList,
      editors: editorsList,
      audioLength: audioInfo.audioLength,
      audioLengthMinutes: edition?.audioLengthMinutes || null,
      rating: work.averageRating,
      ratingsCount: work.ratingsCount,
      publicationYear: work.publicationYear,
      publicationDate: edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : null),
      publisher: edition?.publisher || null,
      pages: edition?.pages || null,
      genres: normalizeAndRankCategories(work.genres.map((item: any) => item.genre.name), 5),
      matchedEdition: normalizedMatchedEdition,
      editions: normalizedEditions,
      translations: work.translations,
      series: work.seriesMemberships,
    },
  };
}

export async function searchCanonicalSeries(
  query: string,
  limit: number
): Promise<NormalizedSearchSeries[]> {
  const rows = await prisma.series.findMany({
    where: {
      OR: [
        { canonicalName: { contains: query, mode: "insensitive" } },
        { translations: { some: { name: { contains: query, mode: "insensitive" } } } },
      ],
    },
    include: {
      memberships: {
        include: {
          work: { include: { contributors: { include: { author: true } } } },
        },
      },
    },
    orderBy: { booksCount: "desc" },
    take: limit,
  });

  return rows.map((series) => ({
    id: series.id,
    provider: "isbndb",
    name: series.canonicalName,
    slug: series.slug,
    author: series.memberships
      .map((membership) => primaryAuthor(membership.work)?.name)
      .find(Boolean),
    booksCount: series.booksCount ?? series.memberships.length,
    sampleBooks: series.memberships
      .slice(0, 3)
      .map((membership) => membership.work.canonicalTitle),
  }));
}

export async function getCanonicalSeriesDetails(
  input: SeriesDetailsInput
): Promise<NormalizedSeriesDetailsResponse | null> {
  const series = await prisma.series.findFirst({
    where: {
      OR: [{ slug: input.slug }, { canonicalName: { equals: input.slug, mode: "insensitive" } }],
    },
    include: {
      translations: true,
      memberships: {
        include: {
          work: {
            include: {
              contributors: { include: { author: true } },
              editions: { include: { covers: true } },
            },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!series) return null;

  const requestedLanguage = input.language || "original";
  const requestedFormat = input.format?.toUpperCase();
  const candidates = series.memberships.flatMap((membership) => {
    const work = membership.work;
    const editions = work.editions.filter((edition) => {
      const languageMatches =
        requestedLanguage === "original" || edition.language === requestedLanguage;
      const formatMatches =
        !requestedFormat ||
        edition.format === requestedFormat ||
        (requestedFormat === "PHYSICAL" && ["HARDCOVER", "PAPERBACK"].includes(edition.format));
      return languageMatches && formatMatches;
    });
    const edition = editions.find((item) => item.isDefault) || editions[0];
    if (!edition && work.editions.length > 0) return [];
    const cover = edition?.covers.find((item) => item.isDefault) || edition?.covers[0];
    return [{ work, membership, edition, cover }];
  });
  const page = candidates.slice(input.offset, input.offset + input.limit);
  const translation = series.translations.find((item) => item.language === requestedLanguage);

  return {
    success: true,
    provider: "aggregate",
    scrapedURL: `canonical://series/${series.id}`,
    series: {
      id: series.id,
      slug: series.slug,
      name: translation?.name || series.canonicalName,
      description: translation?.description || null,
      booksCount: series.booksCount ?? series.memberships.length,
      primaryBooksCount: series.memberships.filter((item) => item.isPrimary).length,
      isCompleted: null,
      author: null,
      provider: "isbndb",
    },
    books: page.map(({ work, membership, edition, cover }) => ({
      id: work.id,
      slug: work.slug,
      title: edition?.title || work.canonicalTitle,
      author: primaryAuthor(work)?.name || "Unknown Author",
      cover: cover?.url || "",
      rating: work.averageRating ?? undefined,
      publicationDate:
        edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : null),
      position: membership.position,
      positionLabel: membership.position == null ? null : String(membership.position),
      featured: edition?.isDefault ?? false,
      compilation: false,
      languageCode: edition?.language || work.originalLanguage || null,
      language: edition?.language || work.originalLanguage || null,
      format: edition?.format?.toLowerCase() || null,
      formatLabel: edition?.format || null,
    })),
    filters: {
      language: requestedLanguage,
      resolvedLanguage: requestedLanguage === "original" ? null : requestedLanguage,
      originalLanguage: series.memberships[0]?.work.originalLanguage || null,
      format: input.format || null,
      dedupedByPosition: true,
    },
    pagination: {
      limit: input.limit,
      offset: input.offset,
      returned: page.length,
      total: candidates.length,
    },
  };
}
