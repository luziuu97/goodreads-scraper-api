import { prisma } from "@/lib/db";
import { normalizeAndRankCategories } from "@/lib/canonical/constants";
import type {
  BookSearchInput,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  SeriesDetailsInput,
} from "@/lib/providers/types";

const workInclude = {
  author: true,
  series: { include: { translations: true } },
  translations: true,
  editions: { include: { covers: true, providerMappings: true } },
  genres: { include: { genre: true } },
  providerMappings: true,
} as const;

function normalizedIsbn(value: string): string | null {
  const clean = value.replace(/[^0-9X]/gi, "").toUpperCase();
  return clean.length === 10 || clean.length === 13 ? clean : null;
}

function providerFor(work: any, edition?: any): "hardcover" | "openlibrary" | "isbndb" {
  const provider = edition?.providerMappings?.[0]?.provider || work.providerMappings?.[0]?.provider;
  return provider === "hardcover" || provider === "openlibrary" || provider === "isbndb"
    ? provider
    : "isbndb";
}

function preferredEdition(work: any, language?: string, isbn?: string | null) {
  return (
    work.editions.find((edition: any) =>
      isbn && [edition.isbn13, edition.isbn10, edition.asin].includes(isbn)
    ) ||
    work.editions.find((edition: any) => language && edition.language === language) ||
    work.editions.find((edition: any) => edition.isDefault) ||
    work.editions[0]
  );
}

export function canonicalWorkToSearchBook(
  work: any,
  language?: string,
  isbn?: string | null
): NormalizedSearchBook {
  const edition = preferredEdition(work, language, isbn);
  const cover = edition?.covers.find((item: any) => item.isDefault) || edition?.covers[0];
  const translation = work.translations.find((item: any) => item.language === language);

  return {
    id: work.id,
    provider: providerFor(work, edition),
    title: translation?.title || edition?.title || work.canonicalTitle,
    workTitle: work.canonicalTitle,
    author: work.author?.name || "Unknown Author",
    cover: cover?.url || "",
    rating: work.averageRating ?? undefined,
    publicationDate:
      edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : undefined),
    genres: normalizeAndRankCategories(
      work.genres.map((item: any) => item.genre.name),
      5
    ),
    isbn: edition?.isbn13 || edition?.isbn10 || null,
    isbn10: edition?.isbn10 || null,
    language: edition?.language || work.originalLanguage || null,
    languageCode: edition?.language || work.originalLanguage || null,
    presentation: isbn ? "isbn" : edition ? "edition" : "work",
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
          cover: cover?.url || "",
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
      { translations: { some: { title: { contains: query, mode: "insensitive" as const } } } },
      { editions: { some: { title: { contains: query, mode: "insensitive" as const } } } },
    ],
  };
  const authorMatch = {
    author: { is: { name: { contains: query, mode: "insensitive" as const } } },
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

  return works.map((work) => canonicalWorkToSearchBook(work, input.language, isbn));
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
        { providerMappings: { some: { providerWorkId: value } } },
        ...(isbn
          ? [{ editions: { some: { OR: [{ isbn13: isbn }, { isbn10: isbn }, { asin: isbn }] } } }]
          : []),
      ],
    },
    include: workInclude,
  });
}

export function canonicalWorkToDetails(work: any): NormalizedBookDetailsResponse {
  const edition = preferredEdition(work);
  return {
    success: true,
    provider: "aggregate",
    scrapedURL: `canonical://work/${work.id}`,
    book: {
      id: work.id,
      slug: work.slug,
      title: work.canonicalTitle,
      author: work.author?.name || "Unknown Author",
      rating: work.averageRating,
      ratingsCount: work.ratingsCount,
      publicationYear: work.publicationYear,
      genres: normalizeAndRankCategories(work.genres.map((item: any) => item.genre.name), 5),
      matchedEdition: edition || null,
      editions: work.editions,
      translations: work.translations,
      series: work.series,
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
    include: { works: { include: { author: true } } },
    orderBy: { booksCount: "desc" },
    take: limit,
  });

  return rows.map((series) => ({
    id: series.id,
    provider: "isbndb",
    name: series.canonicalName,
    slug: series.slug,
    author: series.works.find((work) => work.author)?.author?.name,
    booksCount: series.booksCount ?? series.works.length,
    sampleBooks: series.works.slice(0, 3).map((work) => work.canonicalTitle),
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
      works: {
        include: {
          author: true,
          editions: { include: { covers: true } },
        },
        orderBy: { seriesPosition: "asc" },
      },
    },
  });
  if (!series) return null;

  const requestedLanguage = input.language || "original";
  const requestedFormat = input.format?.toUpperCase();
  const candidates = series.works.flatMap((work) => {
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
    return [{ work, edition, cover }];
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
      booksCount: series.booksCount ?? series.works.length,
      primaryBooksCount: series.works.length,
      isCompleted: null,
      author: null,
      provider: "isbndb",
    },
    books: page.map(({ work, edition, cover }) => ({
      id: work.id,
      slug: work.slug,
      title: edition?.title || work.canonicalTitle,
      author: work.author?.name || "Unknown Author",
      cover: cover?.url || "",
      rating: work.averageRating ?? undefined,
      publicationDate:
        edition?.publicationDate || (work.publicationYear ? String(work.publicationYear) : null),
      position: work.seriesPosition,
      positionLabel: work.seriesPosition == null ? null : String(work.seriesPosition),
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
      originalLanguage: series.works[0]?.originalLanguage || null,
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
