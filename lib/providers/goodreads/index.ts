import { prisma } from "@/lib/db";
import { isIgnoredAuthor, selectBestCover, toApiBookFormat, toApiFormatLabel } from "@/lib/canonical/constants";
import { canonicalWorkToSearchBook, collapseWorkSeries } from "@/lib/canonical/reader";
import { languageFields } from "@/lib/languages";
import type {
  BookCoversInput,
  BookDataProvider,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedSearchBook,
  NormalizedSearchSeries,
  NormalizedSeriesDetailsResponse,
  NormalizedSeriesSearchResponse,
  SeriesDetailsInput,
  SeriesSearchInput,
} from "@/lib/providers/types";

export const goodreadsProvider: BookDataProvider = {
  id: "goodreads",

  isAvailable(): boolean {
    return true; // Local PostgreSQL database
  },

  async search(input: BookSearchInput): Promise<NormalizedSearchBook[]> {
    const { query, limit, language } = input;
    if (!query || !query.trim()) return [];

    const cleanQuery = query.trim();
    const cleanIsbn = cleanQuery.replace(/[^0-9Xx]/g, "").toUpperCase();
    const isIsbn = cleanIsbn.length === 10 || cleanIsbn.length === 13;

    const textSearchCondition = isIsbn
      ? {
          editions: {
            some: {
              OR: [{ isbn13: cleanIsbn }, { isbn10: cleanIsbn }],
            },
          },
        }
      : {
          OR: [
            { canonicalTitle: { contains: cleanQuery, mode: "insensitive" } },
            {
              titles: {
                some: { title: { contains: cleanQuery, mode: "insensitive" } },
              },
            },
            {
              contributors: {
                some: {
                  author: { name: { contains: cleanQuery, mode: "insensitive" } },
                },
              },
            },
          ],
        };

    const whereClause: any = {
      externalIds: {
        some: { provider: "goodreads-dataset" },
      },
      ...textSearchCondition,
    };

    if (language && !isIsbn) {
      const targetLang = language.toLowerCase();
      whereClause.AND = [
        {
          OR: [
            { originalLanguage: targetLang },
            { editions: { some: { language: targetLang } } },
          ],
        },
      ];
    }

    const works = await prisma.work.findMany({
      where: whereClause,
      take: Math.min(limit, 50),
      orderBy: { popularityScore: "desc" },
      include: {
        translations: true,
        titles: true,
        contributors: {
          include: { author: true },
          orderBy: { position: "asc" },
        },
        editions: {
          take: 50,
          orderBy: [{ isDefault: "desc" }, { ratingsCount: "desc" }],
          include: {
            covers: {
              take: 10,
              orderBy: { isDefault: "desc" },
            },
          },
        },
        genres: {
          include: { genre: true },
          take: 5,
        },
      },
    });

    return works.map((work) => {
      const searchBook = canonicalWorkToSearchBook(
        work,
        isIsbn ? undefined : language,
        isIsbn ? cleanIsbn : undefined,
        query
      );
      return {
        ...searchBook,
        provider: "goodreads" as const,
      };
    });
  },

  async getDetails(input: BookDetailsInput): Promise<NormalizedBookDetailsResponse> {
    const { slug, editionId } = input;
    const cleanIsbn = slug.replace(/[^0-9Xx]/g, "").toUpperCase();
    const isIsbn = cleanIsbn.length === 10 || cleanIsbn.length === 13;

    let work = await prisma.work.findFirst({
      where: {
        OR: [
          { slug },
          { id: slug },
          ...(isIsbn
            ? [
                {
                  editions: {
                    some: {
                      OR: [{ isbn13: cleanIsbn }, { isbn10: cleanIsbn }],
                    },
                  },
                },
              ]
            : []),
        ],
        externalIds: {
          some: { provider: "goodreads-dataset" },
        },
      },
      include: {
        translations: true,
        titles: true,
        contributors: {
          include: { author: true },
          orderBy: { position: "asc" },
        },
        editions: {
          include: {
            covers: true,
            contributors: { include: { author: true } },
          },
          orderBy: [{ isDefault: "desc" }, { ratingsCount: "desc" }],
        },
        genres: {
          include: { genre: true },
        },
        seriesMemberships: {
          include: {
            series: {
              include: {
                memberships: {
                  select: {
                    position: true,
                    isPrimary: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!work && editionId) {
      const ed = await prisma.edition.findUnique({
        where: { id: String(editionId) },
        include: {
          work: {
            include: {
              translations: true,
              titles: true,
              contributors: { include: { author: true } },
              editions: { include: { covers: true } },
              genres: { include: { genre: true } },
              seriesMemberships: {
                include: {
                  series: {
                    include: {
                      memberships: {
                        select: {
                          position: true,
                          isPrimary: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (ed) work = ed.work as any;
    }

    if (!work) {
      throw new Error(`Book not found for slug/id: ${slug}`);
    }

    const matchedEdition = isIsbn
      ? work.editions.find(
          (e) => e.isbn13 === cleanIsbn || e.isbn10 === cleanIsbn
        )
      : undefined;

    const defaultEdition =
      matchedEdition ||
      work.editions.find((e) => e.isDefault) ||
      work.editions[0];

    const rawTitle =
      defaultEdition?.title ||
      work.canonicalTitle;

    const displayTitle =
      rawTitle.replace(/\s*\([^)]*#\d+[^)]*\)/gi, "").trim() || rawTitle;

    const bookObj = {
      id: work.id,
      slug: work.slug,
      title: displayTitle,
      workTitle: work.canonicalTitle,
      originalLanguage: work.originalLanguage,
      publicationYear: work.publicationYear,
      originalPublicationYear: work.publicationYear ?? null,
      averageRating: work.averageRating,
      ratingsCount: work.ratingsCount,
      reviewsCount: work.reviewsCount,
      popularityScore: work.popularityScore,
      author:
        work.contributors.find(
          (a) =>
            a.role === "AUTHOR" &&
            !isIgnoredAuthor(a.author.id, a.author.name)
        )?.author?.name ||
        work.contributors.find((a) => !isIgnoredAuthor(a.author.id, a.author.name))
          ?.author?.name ||
        "Unknown Author",
      authors: work.contributors
        .filter(
          (a) =>
            a.role === "AUTHOR" &&
            !isIgnoredAuthor(a.author.id, a.author.name)
        )
        .map((a) => ({
          id: a.author.id,
          name: a.author.name,
          role: a.role,
        })),
      genres: work.genres.map((g) => g.genre.name),
      series: collapseWorkSeries(work.seriesMemberships),
      editions: work.editions.map((ed) => ({
        id: ed.id,
        title: ed.title,
        isbn10: ed.isbn10,
        isbn13: ed.isbn13,
        asin: ed.asin,
        format: toApiBookFormat(ed.format),
        language: ed.language,
        publisher: ed.publisher,
        pages: ed.pages,
        publicationDate: ed.publicationDate,
        isDefault: ed.isDefault,
        cover: selectBestCover(ed.covers)?.url || "",
      })),
      defaultEdition: defaultEdition
        ? {
            id: defaultEdition.id,
            title: defaultEdition.title,
            isbn10: defaultEdition.isbn10,
            isbn13: defaultEdition.isbn13,
            asin: defaultEdition.asin,
            format: toApiBookFormat(defaultEdition.format),
            language: defaultEdition.language,
            publisher: defaultEdition.publisher,
            pages: defaultEdition.pages,
            publicationDate: defaultEdition.publicationDate,
            cover: selectBestCover(defaultEdition.covers)?.url || "",
          }
        : null,
    };

    return {
      success: true,
      provider: "goodreads",
      scrapedURL: `local://goodreads-dataset/works/${work.id}`,
      book: bookObj,
    };
  },

  async getCovers(input: BookCoversInput): Promise<NormalizedBookCoversResponse> {
    const { slug, limit, onlyWithCover } = input;

    const work = await prisma.work.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        externalIds: {
          some: { provider: "goodreads-dataset" },
        },
      },
      include: {
        editions: {
          include: {
            covers: true,
          },
          take: Math.min(limit, 100),
        },
      },
    });

    if (!work) {
      return {
        success: true,
        provider: "goodreads",
        scrapedURL: `local://goodreads-dataset/works/${slug}`,
        book: {
          id: slug,
          slug,
          title: slug,
          provider: "goodreads",
        },
        covers: [],
        bestByResolution: null,
        totalCovers: 0,
        totalEditions: 0,
      };
    }

    const covers: any[] = [];
    for (const ed of work.editions) {
      for (const cov of ed.covers) {
        if (onlyWithCover && (!cov.url || cov.url.trim() === "")) continue;
        covers.push({
          editionId: ed.id,
          title: ed.title,
          url: cov.url,
          width: cov.width,
          height: cov.height,
          ratio: cov.width && cov.height ? cov.width / cov.height : null,
          color: null,
          pixelCount: cov.pixelCount,
          imageId: cov.id,
          format: toApiBookFormat(ed.format),
          isbn: ed.isbn13,
          isbn10: ed.isbn10,
          asin: ed.asin,
          publicationDate: ed.publicationDate,
          pages: ed.pages,
          publisher: ed.publisher,
          ...languageFields(ed.language),
          country: null,
          countryCode: null,
          isDefault: ed.isDefault,
        });
      }
    }

    return {
      success: true,
      provider: "goodreads",
      scrapedURL: `local://goodreads-dataset/works/${work.id}`,
      book: {
        id: work.id,
        slug: work.slug,
        title: work.canonicalTitle,
        provider: "goodreads",
      },
      covers,
      bestByResolution: covers[0]
        ? {
            editionId: covers[0].editionId,
            url: covers[0].url,
            width: covers[0].width,
            height: covers[0].height,
            pixelCount: covers[0].pixelCount,
          }
        : null,
      totalCovers: covers.length,
      totalEditions: work.editions.length,
    };
  },

  async searchSeries(input: SeriesSearchInput): Promise<NormalizedSearchSeries[]> {
    const { query, limit } = input;
    if (!query || !query.trim()) return [];

    const seriesList = await prisma.series.findMany({
      where: {
        canonicalName: { contains: query.trim(), mode: "insensitive" },
        externalIds: {
          some: { provider: "goodreads-dataset" },
        },
      },
      take: Math.min(limit, 50),
    });

    return seriesList.map((s) => ({
      id: s.id,
      provider: "goodreads",
      name: s.canonicalName,
      slug: s.slug,
      booksCount: s.booksCount ?? undefined,
    }));
  },

  async getSeriesDetails(input: SeriesDetailsInput): Promise<NormalizedSeriesDetailsResponse> {
    const { slug, limit, offset, language, format } = input;

    const series = await prisma.series.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
        externalIds: {
          some: { provider: "goodreads-dataset" },
        },
      },
      include: {
        memberships: {
          include: {
            work: {
              include: {
                contributors: { include: { author: true } },
                editions: {
                  take: 1,
                  orderBy: [{ isDefault: "desc" }],
                  include: { covers: { take: 1 } },
                },
              },
            },
          },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!series) {
      throw new Error(`Series not found for slug/id: ${slug}`);
    }

    const books = series.memberships.map((ws, idx) => {
      const w = ws.work;
      const primaryAuthor = w.contributors[0]?.author?.name || "Unknown Author";
      const ed = w.editions[0];
      return {
        id: w.id,
        slug: w.slug,
        title: w.canonicalTitle,
        author: primaryAuthor,
        cover: ed?.covers[0]?.url || "",
        rating: w.averageRating ?? undefined,
        publicationDate: w.publicationYear ? String(w.publicationYear) : null,
        position: ws.position ?? idx + 1,
        positionLabel: ws.position ? String(ws.position) : `${idx + 1}`,
        featured: true,
        compilation: false,
        ...languageFields(w.originalLanguage),
        format: ed?.format ? toApiBookFormat(ed.format) : null,
        formatLabel: ed?.format ? toApiFormatLabel(ed.format) : null,
      };
    });

    const paginatedBooks = books.slice(offset, offset + limit);

    return {
      success: true,
      provider: "goodreads",
      scrapedURL: `local://goodreads-dataset/series/${series.id}`,
      series: {
        id: series.id,
        slug: series.slug,
        name: series.canonicalName,
        description: null,
        booksCount: series.booksCount ?? books.length,
        primaryBooksCount: books.length,
        isCompleted: null,
        author: null,
        provider: "goodreads",
      },
      books: paginatedBooks,
      filters: {
        language: language ?? "original",
        resolvedLanguage: null,
        originalLanguage: null,
        format: format ?? null,
        dedupedByPosition: true,
      },
      pagination: {
        limit,
        offset,
        returned: paginatedBooks.length,
        total: books.length,
      },
    };
  },
};
