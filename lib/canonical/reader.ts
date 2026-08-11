import { prisma } from "@/lib/db";
import { formatAudioLength, isIgnoredAuthor, isTextInLanguage, normalizeAuthorSlug, normalizeBookFormat, normalizeAndRankCategories, selectBestCover, normalizeLanguage, normalizeSearchText, normalizeValidIsbn, roundRating, pickBestCoverUrl } from "@/lib/canonical/constants";
import type {
  BookSearchInput,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  SeriesDetailsInput,
} from "@/lib/providers/types";
import { rankEditionsForPresentation } from "@/lib/canonical/edition-selection";

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
  return normalizeValidIsbn(value);
}

function providerReference(work: any, edition?: any) {
  const priority = ["hardcover", "goodreads", "goodreads-dataset", "openlibrary", "isbndb"];
  const mapping = [...(work.externalIds || [])]
    .filter((item: any) => item.externalId && priority.includes(item.provider))
    .sort((a: any, b: any) => priority.indexOf(a.provider) - priority.indexOf(b.provider))[0];

  if (mapping) {
    return {
      provider: (mapping.provider === "goodreads-dataset" ? "goodreads" : mapping.provider) as "hardcover" | "goodreads" | "openlibrary" | "isbndb",
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
  return normalizeSearchText(title.replace(/\s*\([^)]*#\d+[^)]*\)/gi, ""));
}

function preferredEdition(work: any, language?: string, isbn?: string | null, query?: string) {
  if (isbn) {
    const match = work.editions.find((edition: any) =>
      [edition.isbn13, edition.isbn10, edition.asin].includes(isbn)
    );
    if (match) return match;
  }

  return rankEditionsForPresentation(work.editions || [], {
    requestedLanguage: language,
    originalLanguage: work.originalLanguage,
    query,
  })[0];
}

function detectQueryLanguageMatch(work: any, query?: string): string | undefined {
  if (!query || !query.trim()) return undefined;
  const normQuery = cleanTitleForMatch(query);
  if (!normQuery || normQuery.length < 3) return undefined;

  // Check if query matches the canonical title or an original language / English edition first
  const normCanonical = cleanTitleForMatch(work.canonicalTitle || "");
  if (normCanonical.length >= 3 && (normCanonical.includes(normQuery) || normQuery.includes(normCanonical))) {
    return undefined;
  }

  const origLang = work.originalLanguage || "en";
  const origEdMatch = (work.editions || []).some((ed: any) => {
    if ((ed.language === origLang || ed.language === "en") && ed.title) {
      const normTitle = cleanTitleForMatch(ed.title);
      return normTitle.length >= 3 && (normTitle.includes(normQuery) || normQuery.includes(normTitle));
    }
    return false;
  });

  if (origEdMatch) {
    return undefined;
  }

  // 1. Check translations
  for (const trans of work.translations || []) {
    if (trans.title && trans.language !== origLang && trans.language !== "en") {
      const normTitle = cleanTitleForMatch(trans.title);
      if (normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)))) {
        return trans.language;
      }
    }
  }

  // 2. Check work titles
  for (const titleObj of work.titles || []) {
    if (titleObj.title && titleObj.language !== origLang && titleObj.language !== "en") {
      const normTitle = cleanTitleForMatch(titleObj.title);
      if (normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)))) {
        return titleObj.language;
      }
    }
  }

  // 3. Check edition titles
  for (const ed of work.editions || []) {
    if (ed.title && ed.language && ed.language !== origLang && ed.language !== "en") {
      const normTitle = cleanTitleForMatch(ed.title);
      if (normTitle.length >= 3 && (normTitle.includes(normQuery) || (normQuery.length >= 5 && normQuery.includes(normTitle)))) {
        return ed.language;
      }
    }
  }

  return undefined;
}

function buildAllCoverCandidates(work: any): Array<{ url: string; provider?: string }> {
  const candidates: Array<{ url: string; provider?: string }> = [];

  for (const ed of work.editions || []) {
    for (const c of ed.covers || []) {
      if (c && c.url && c.url.trim()) {
        candidates.push({ url: c.url.trim(), provider: c.provider || undefined });
      }
    }
  }

  for (const ed of work.editions || []) {
    const isbn = ed.isbn13 || ed.isbn10;
    if (isbn) {
      const clean = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
      if (clean.length === 10 || clean.length === 13) {
        candidates.push({
          url: `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`,
          provider: "openlibrary",
        });
      }
    }
  }

  return candidates;
}

export function canonicalWorkToSearchBook(
  work: any,
  language?: string,
  isbn?: string | null,
  query?: string
): NormalizedSearchBook {
  const detectedLang = !language ? detectQueryLanguageMatch(work, query) : undefined;
  const effectiveLang = language || (detectedLang ? toIso639_1(detectedLang) || undefined : undefined);

  const edition = preferredEdition(work, effectiveLang, isbn || undefined, query);
  const allCovers = buildAllCoverCandidates(work);
  const editionCoverObj = selectBestCover(edition?.covers);
  // The preferred edition controls presentation metadata, but its Goodreads
  // image must not eclipse a better cover available elsewhere on the work.
  const coverObj = selectBestCover([
    ...(edition?.covers || []),
    ...allCovers,
  ]);
  const translation = effectiveLang
    ? work.translations.find((item: any) => toIso639_1(item.language) === effectiveLang || item.language === effectiveLang)
    : undefined;
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
      const edIsbn = ed.isbn13 || ed.isbn10;
      const edOlCandidate = edIsbn
        ? `https://covers.openlibrary.org/b/isbn/${edIsbn.replace(/[^0-9Xx]/g, "").toUpperCase()}-L.jpg`
        : undefined;
      const edCoverCandidates = [
        ...(ed.covers || []),
        ...(edOlCandidate ? [{ url: edOlCandidate, provider: "openlibrary" }] : []),
      ];
      const edCoverObj = selectBestCover(edCoverCandidates);
      const edLang = normalizeLanguage(ed.language);
      return {
        isbn: ed.isbn13 ?? null,
        isbn10: ed.isbn10 ?? null,
        language: edLang,
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

  const resolvedLang = normalizeLanguage(edition?.language || effectiveLang || work.originalLanguage);

  return {
    id: work.id,
    provider: "canonical",
    title: displayTitle,
    workTitle: work.canonicalTitle,
    author: author?.name || "Unknown Author",
    cover: coverObj?.url || "",
    rating: roundRating(work.averageRating) ?? undefined,
    publicationDate:
      edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : undefined),
    genres: normalizeAndRankCategories(
      work.genres.map((item: any) => item.genre.name),
      5
    ),
    isbn: edition?.isbn13 || edition?.isbn10 || null,
    isbn10: edition?.isbn10 || null,
    language: resolvedLang,
    languageCode: resolvedLang,
    presentation: isbn ? "isbn" : edition ? "edition" : "work",
    sources: (work.externalIds || []).map((item: any) => ({
      title: item.provider,
      url: `${item.provider}:${item.externalId}`,
    })),
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
          language: normalizeLanguage(edition.language),
          languageCode: normalizeLanguage(edition.language),
          country: null,
          countryCode: null,
          cover: editionCoverObj?.url || "",
        }
      : undefined,
  };
}

export async function searchCanonicalBooks(
  input: BookSearchInput
): Promise<NormalizedSearchBook[]> {
  const query = input.query.trim();
  const normalizedQuery = normalizeSearchText(query);
  const isbn = normalizedIsbn(query);
  const titleMatch = {
    OR: [
      { canonicalTitle: { contains: query, mode: "insensitive" as const } },
      { titles: { some: { normalizedTitle: { contains: normalizedQuery } } } },
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
    take: Math.min(Math.max(input.limit * 5, input.limit), 250),
  });

  if (isbn && new Set(works.map((work) => work.id)).size > 1) {
    console.error("Ambiguous ISBN found in canonical store; deferring to primary providers", {
      isbn,
      workIds: works.map((work) => work.id),
    });
    return [];
  }

  return works
    .map((work) => canonicalWorkToSearchBook(work, input.language, isbn, query))
    .sort((a, b) => {
      const score = (book: NormalizedSearchBook) => {
        const title = normalizeSearchText(book.title);
        const workTitle = normalizeSearchText(book.workTitle);
        if (title === normalizedQuery || workTitle === normalizedQuery) return 1000;
        if (title.startsWith(normalizedQuery) || workTitle.startsWith(normalizedQuery)) return 700;
        if (title.includes(normalizedQuery) || workTitle.includes(normalizedQuery)) return 500;
        return 0;
      };
      return score(b) - score(a) || (b.rating || 0) - (a.rating || 0);
    })
    .slice(0, input.limit);
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
  let descriptionLanguage: string | null = null;
  if (effectiveIso) {
    const langTrans = work.translations?.find(
      (item: any) => toIso639_1(item.language) === effectiveIso && isTextInLanguage(item.description, effectiveIso)
    );
    if (langTrans) {
      description = langTrans.description.trim();
      descriptionLanguage = effectiveIso;
    }

    if (!description) {
      const langEd = work.editions?.find(
        (item: any) =>
          (toIso639_1(item.language) === effectiveIso || item.language === (effectiveIso === "es" ? "spa" : effectiveIso)) &&
          isTextInLanguage(item.description, effectiveIso)
      );
      if (langEd?.description) {
        description = langEd.description.trim();
        descriptionLanguage = effectiveIso;
      }
    }
  }

  if (!description) {
    const anyTrans = work.translations?.find((item: any) => item.description?.trim());
    if (anyTrans?.description) {
      description = anyTrans.description.trim();
      descriptionLanguage = toIso639_1(anyTrans.language);
    }
  }

  if (!description && edition?.description?.trim()) {
    description = edition.description.trim();
    descriptionLanguage = toIso639_1(edition.language);
  }

  // Use the translation title only when it actually reflects the target language
  // (i.e. it differs from the canonical English work title).  If the stored
  // translation title matches the canonical title it was likely written from an
  // English ingest pass and the edition title is a more accurate source.
  const translationTitle =
    translation?.title &&
    (effectiveIso === "en" ||
      normalizeSearchText(translation.title) !==
        normalizeSearchText(work.canonicalTitle))
      ? translation.title
      : null;
  const rawTitle = translationTitle || edition?.title || work.canonicalTitle;
  const displayTitle = rawTitle.replace(/\s*\([^)]*#\d+[^)]*\)/gi, "").trim() || rawTitle;

  const normalizedMatchedEdition = edition
    ? {
        id: edition.id,
        title: edition.title,
        format: normalizeBookFormat(edition.format),
        language: toIso639_1(edition.language) || "und",
        isbn13: edition.isbn13,
        isbn10: edition.isbn10,
        asin: edition.asin,
        publisher: edition.publisher,
        publicationDate: edition.publicationDate,
        pages: edition.pages,
        audioLengthMinutes: edition.audioLengthMinutes,
        cover: pickBestCoverUrl([
          ...(edition.covers?.map((c: any) => c.url) || []),
        ]),
      }
    : null;

  const normalizedEditions = (work.editions || []).map((ed: any) => {
    const edIsbn = ed.isbn13 || ed.isbn10;
    const olCover = edIsbn
      ? `https://covers.openlibrary.org/b/isbn/${edIsbn.replace(/[^0-9Xx]/g, "").toUpperCase()}-L.jpg`
      : undefined;
    const bestCover = pickBestCoverUrl([
      ed.cover,
      ...(ed.covers?.map((c: any) => c.url) || []),
      olCover,
    ]);
    return {
      id: ed.id,
      title: ed.title,
      format: normalizeBookFormat(ed.format),
      language: toIso639_1(ed.language) || "und",
      isbn13: ed.isbn13,
      isbn10: ed.isbn10,
      asin: ed.asin,
      publisher: ed.publisher,
      publicationDate: ed.publicationDate,
      pages: ed.pages,
      audioLengthMinutes: ed.audioLengthMinutes,
      isDefault: ed.isDefault,
      cover: bestCover || "",
    };
  });

  const publicTranslations = Array.from(
    (work.translations || []).reduce((byLanguage: Map<string, any>, item: any) => {
      const code = toIso639_1(item.language);
      if (!code) return byLanguage;
      const existing = byLanguage.get(code);
      if (!existing || (!existing.description && item.description)) {
        byLanguage.set(code, {
          language: code,
          title: item.title,
          description: item.description || null,
        });
      }
      return byLanguage;
    }, new Map<string, any>()).values()
  );

  function dedupeContributors(contributors: any[]) {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const c of contributors) {
      const name = c.author?.name || c.name || "";
      const id = c.author?.id || c.id || "0";
      const slug = normalizeAuthorSlug(name);
      if (isIgnoredAuthor(id, name, slug)) continue;
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        result.push({
          id,
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
      descriptionLanguage,
      requestedLanguage: targetIso,
      isLanguageFallback: Boolean(
        (targetIso || effectiveIso) &&
          description &&
          descriptionLanguage &&
          descriptionLanguage !== (targetIso || effectiveIso)
      ),
      language: normalizeLanguage(effectiveLang),
      languageCode: normalizeLanguage(effectiveLang),
      author: authorsList[0]?.name || author?.name || "Unknown Author",
      authors: authorsList.length > 0 ? authorsList : [{ id: author?.id || "0", name: author?.name || "Unknown Author", role: "AUTHOR" }],
      translators: translatorsList,
      illustrators: illustratorsList,
      narrators: narratorsList,
      editors: editorsList,
      audioLength: audioInfo.audioLength,
      audioLengthMinutes: edition?.audioLengthMinutes || null,
      rating: roundRating(work.averageRating),
      ratingsCount: work.ratingsCount,
      publicationYear: work.publicationYear,
      publicationDate: edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : null),
      publisher: edition?.publisher || null,
      pages: edition?.pages || null,
      genres: normalizeAndRankCategories(work.genres.map((item: any) => item.genre.name), 5),
      matchedEdition: normalizedMatchedEdition,
      editions: normalizedEditions,
      translations: publicTranslations,
      series: work.seriesMemberships.map((membership: any) => ({
        id: membership.series.id,
        slug: membership.series.slug,
        name: membership.series.canonicalName,
        position: membership.position,
        isPrimary: membership.isPrimary,
      })),
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

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const author = row.memberships.map((membership) => primaryAuthor(membership.work)?.name).find(Boolean) || "";
    const key = `${normalizeSearchText(row.canonicalName)}|${normalizeAuthorSlug(author)}`;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return [...grouped.values()].map((group) => {
    const representative = [...group].sort((a, b) => b.memberships.length - a.memberships.length)[0];
    const memberships = group.flatMap((item) => item.memberships);
    const uniqueWorks = [...new Map(memberships.map((item) => [item.work.id, item.work])).values()];
    const numberedWorks = uniqueWorks.filter(
      (work) => normalizeSearchText(work.canonicalTitle) !== normalizeSearchText(representative.canonicalName)
    );
    return {
      id: representative.id,
      provider: "canonical" as const,
      name: representative.canonicalName,
      slug: representative.slug,
      author: memberships.map((membership) => primaryAuthor(membership.work)?.name).find(Boolean),
      booksCount: numberedWorks.length || uniqueWorks.length,
      sampleBooks: uniqueWorks.slice(0, 3).map((work) => work.canonicalTitle),
    };
  }).slice(0, limit);
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

  // Historical imports could split one logical series across suffixed slugs.
  // Read them as one canonical series until the offline repair merges rows.
  const siblingSeries = await prisma.series.findMany({
    where: { canonicalName: { equals: series.canonicalName, mode: "insensitive" } },
    include: {
      memberships: {
        include: {
          work: {
            include: {
              contributors: { include: { author: true } },
              editions: { include: { covers: true } },
            },
          },
        },
      },
    },
  });
  const allMemberships = [...new Map(
    siblingSeries.flatMap((item) => item.memberships).map((membership) => [membership.workId, membership])
  ).values()].sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

  const requestedLanguage = input.language === "original" ? "original" : (toIso639_1(input.language) || "original");
  const requestedFormat = input.format?.toUpperCase();
  const candidates = allMemberships.flatMap((membership) => {
    const work = membership.work;
    const editions = work.editions.filter((edition) => {
      const languageMatches =
        requestedLanguage === "original" || toIso639_1(edition.language) === requestedLanguage;
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
  const translation = series.translations.find((item) => toIso639_1(item.language) === requestedLanguage);
  const isCompilation = (work: any, edition?: any) =>
    normalizeSearchText(work.canonicalTitle) === normalizeSearchText(series.canonicalName) ||
    /#\d+\s*-\s*\d+/i.test(edition?.title || "");
  const numberedMemberships = allMemberships.filter((membership) => !isCompilation(membership.work));

  return {
    success: true,
    provider: "aggregate",
    scrapedURL: `canonical://series/${series.id}`,
    series: {
      id: series.id,
      slug: series.slug,
      name: translation?.name || series.canonicalName,
      description: translation?.description || null,
      booksCount: numberedMemberships.length || allMemberships.length,
      primaryBooksCount: numberedMemberships.filter((item) => item.isPrimary).length,
      isCompleted: null,
      author: null,
      provider: "canonical",
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
      compilation: isCompilation(work, edition),
      languageCode: toIso639_1(edition?.language || work.originalLanguage) || null,
      language: toIso639_1(edition?.language || work.originalLanguage) || null,
      format: edition?.format?.toLowerCase() || null,
      formatLabel: edition?.format || null,
    })),
    filters: {
      language: requestedLanguage,
      resolvedLanguage: requestedLanguage === "original" ? null : requestedLanguage,
      originalLanguage: toIso639_1(allMemberships[0]?.work.originalLanguage) || null,
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
