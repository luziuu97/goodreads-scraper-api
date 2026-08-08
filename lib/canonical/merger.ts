import { prisma } from "@/lib/db";
import {
  detectImageFormat,
  normalizeBookFormat,
  normalizeLanguageCode,
} from "@/lib/canonical/constants";
import { registerCanonicalLookups } from "@/lib/canonical/resolver";
import { getImageDimensions } from "@/lib/utils/image-size";
import type { ProviderId } from "@/lib/providers/types";

export type RawProviderBookInput = {
  provider: ProviderId;
  providerWorkId?: string;
  providerEditionId?: string;
  title: string;
  originalTitle?: string;
  authorName?: string;
  description?: string;
  language?: string;
  publicationYear?: number;
  publicationDate?: string;
  publisher?: string;
  pages?: number;
  isbn10?: string | null;
  isbn13?: string | null;
  asin?: string | null;
  format?: string | null;
  coverUrl?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
  rating?: number | null;
  ratingsCount?: number | null;
  genres?: string[];
  seriesName?: string | null;
  seriesPosition?: number | null;
  seriesDescription?: string | null;
};

async function safeUpsertAuthor(name: string, slug: string) {
  const existing = await prisma.author.findUnique({ where: { slug } });
  if (existing) return existing;
  try {
    return await prisma.author.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const reFound = await prisma.author.findUnique({ where: { slug } });
      if (reFound) return reFound;
    }
    throw err;
  }
}

async function safeUpsertSeries(name: string, slug: string) {
  const existing = await prisma.series.findUnique({ where: { slug } });
  if (existing) return existing;
  try {
    return await prisma.series.upsert({
      where: { slug },
      update: {},
      create: { canonicalName: name, slug },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const reFound = await prisma.series.findUnique({ where: { slug } });
      if (reFound) return reFound;
    }
    throw err;
  }
}

async function safeUpsertGenre(name: string) {
  const existing = await prisma.genre.findUnique({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.genre.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const reFound = await prisma.genre.findUnique({ where: { name } });
      if (reFound) return reFound;
    }
    throw err;
  }
}

/**
 * Ingest provider book payload and merge into persistent Prisma Work/Edition models.
 */
export async function upsertCanonicalWorkFromProvider(
  input: RawProviderBookInput
): Promise<string> {
  const {
    provider,
    providerWorkId,
    providerEditionId,
    title,
    originalTitle,
    authorName,
    description,
    publicationYear,
    publicationDate,
    publisher,
    pages,
    isbn10,
    isbn13,
    asin,
    coverUrl,
    coverWidth,
    coverHeight,
    rating,
    ratingsCount,
    genres,
    seriesName,
    seriesPosition,
    seriesDescription,
  } = input;

  const langCode = normalizeLanguageCode(input.language);
  const bookFormat = normalizeBookFormat(input.format);
  const canonicalTitleStr = originalTitle?.trim() || title.trim();
  const slugStr = canonicalTitleStr
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // 1. Resolve or Create Author
  let authorId: string | null = null;
  if (authorName?.trim()) {
    const authorSlug = authorName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    
    const author = await safeUpsertAuthor(authorName.trim(), authorSlug);
    authorId = author.id;
  }

  // 2. Resolve or Create Series
  let seriesId: string | null = null;
  if (seriesName?.trim()) {
    const seriesSlug = seriesName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const series = await safeUpsertSeries(seriesName.trim(), seriesSlug);
    seriesId = series.id;

    // Series Translation
    await prisma.seriesTranslation.upsert({
      where: {
        seriesId_language: { seriesId: series.id, language: langCode },
      },
      update: {
        name: seriesName.trim(),
        description: seriesDescription || undefined,
      },
      create: {
        seriesId: series.id,
        language: langCode,
        name: seriesName.trim(),
        description: seriesDescription || null,
      },
    });
  }

  // 3. Resolve Work (via ProviderMapping, ISBN, or Slug)
  let existingWorkId: string | null = null;

  if (providerWorkId) {
    const map = await prisma.providerMapping.findFirst({
      where: { provider, providerWorkId },
      select: { workId: true },
    });
    if (map) existingWorkId = map.workId;
  }

  if (!existingWorkId && (isbn13 || isbn10 || asin)) {
    const edition = await prisma.edition.findFirst({
      where: {
        OR: [
          ...(isbn13 ? [{ isbn13 }] : []),
          ...(isbn10 ? [{ isbn10 }] : []),
          ...(asin ? [{ asin }] : []),
        ],
      },
      select: { workId: true },
    });
    if (edition) existingWorkId = edition.workId;
  }

  if (!existingWorkId) {
    const workBySlug = await prisma.work.findUnique({
      where: { slug: slugStr },
      select: { id: true },
    });
    if (workBySlug) existingWorkId = workBySlug.id;
  }

  // 4. Create or Update Work
  let workId: string;
  if (existingWorkId) {
    workId = existingWorkId;
    await prisma.work.update({
      where: { id: workId },
      data: {
        authorId: authorId || undefined,
        seriesId: seriesId || undefined,
        seriesPosition: seriesPosition !== undefined ? seriesPosition : undefined,
        publicationYear: publicationYear || undefined,
        averageRating: rating || undefined,
        ratingsCount: ratingsCount || undefined,
      },
    });
  } else {
    try {
      const newWork = await prisma.work.create({
        data: {
          slug: slugStr,
          canonicalTitle: canonicalTitleStr,
          originalLanguage: langCode,
          publicationYear,
          averageRating: rating,
          ratingsCount,
          authorId,
          seriesId,
          seriesPosition,
        },
      });
      workId = newWork.id;
    } catch (err: any) {
      if (err?.code === "P2002") {
        const workBySlug = await prisma.work.findUnique({
          where: { slug: slugStr },
        });
        if (workBySlug) {
          workId = workBySlug.id;
          await prisma.work.update({
            where: { id: workId },
            data: {
              authorId: authorId || undefined,
              seriesId: seriesId || undefined,
              seriesPosition: seriesPosition !== undefined ? seriesPosition : undefined,
              publicationYear: publicationYear || undefined,
              averageRating: rating || undefined,
              ratingsCount: ratingsCount || undefined,
            },
          });
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  // 5. Work Translation
  if (title || description) {
    await prisma.workTranslation.upsert({
      where: {
        workId_language: { workId, language: langCode },
      },
      update: {
        title: title.trim(),
        description: description || undefined,
      },
      create: {
        workId,
        language: langCode,
        title: title.trim(),
        description: description || null,
      },
    });
  }

  // 6. Merging Genres (Union)
  if (genres && genres.length > 0) {
    const validGenres = genres.filter((g): g is string => Boolean(g && g.trim()));
    if (validGenres.length > 0) {
      const genreRecords = await Promise.all(
        validGenres.map((gName) => safeUpsertGenre(gName.trim()))
      );
      const uniqueGenreIds = Array.from(new Set(genreRecords.map((g) => g.id)));
      if (uniqueGenreIds.length > 0) {
        await prisma.genreOnWork.createMany({
          data: uniqueGenreIds.map((genreId) => ({ workId, genreId })),
          skipDuplicates: true,
        });
      }
    }
  }

  // 7. Edition & Covers Upsert
  let editionId: string | null = null;
  if (isbn13 || isbn10 || asin || providerEditionId) {
    const existingEdition = await prisma.edition.findFirst({
      where: {
        workId,
        OR: [
          ...(isbn13 ? [{ isbn13 }] : []),
          ...(isbn10 ? [{ isbn10 }] : []),
          ...(asin ? [{ asin }] : []),
        ],
      },
    });

    if (existingEdition) {
      editionId = existingEdition.id;
      const isIsbndb = provider === "isbndb";
      await prisma.edition.update({
        where: { id: editionId },
        data: {
          publisher: isIsbndb ? (publisher || existingEdition.publisher) : (publisher || undefined),
          publicationDate: isIsbndb ? (publicationDate || existingEdition.publicationDate) : (publicationDate || undefined),
          pages: isIsbndb ? (pages || existingEdition.pages) : (pages || undefined),
          format: isIsbndb ? (bookFormat || existingEdition.format) : undefined,
          language: isIsbndb ? (langCode || existingEdition.language) : undefined,
          isbn10: isIsbndb ? (isbn10 || existingEdition.isbn10) : undefined,
          isbn13: isIsbndb ? (isbn13 || existingEdition.isbn13) : undefined,
        },
      });
    } else {
      const newEd = await prisma.edition.create({
        data: {
          workId,
          title: title.trim(),
          format: bookFormat,
          language: langCode,
          isbn10: isbn10 || null,
          isbn13: isbn13 || null,
          asin: asin || null,
          publisher: publisher || null,
          publicationDate: publicationDate || null,
          pages: pages || null,
          isDefault: true,
        },
      });
      editionId = newEd.id;
    }

    // Upsert Cover Image & Calculate Dimensions
    if (coverUrl?.trim()) {
      let finalW = coverWidth || null;
      let finalH = coverHeight || null;
      let finalPixelCount = finalW && finalH ? finalW * finalH : null;
      let imgFormat = detectImageFormat(coverUrl);

      if (!finalW || !finalH) {
        const measured = await getImageDimensions(coverUrl);
        if (measured.width && measured.height) {
          finalW = measured.width;
          finalH = measured.height;
          finalPixelCount = measured.pixelCount;
          imgFormat = measured.format || imgFormat;
        }
      }

      const existingCover = await prisma.editionCover.findFirst({
        where: { editionId, url: coverUrl },
      });

      if (!existingCover) {
        await prisma.editionCover.create({
          data: {
            editionId,
            provider,
            url: coverUrl,
            width: finalW,
            height: finalH,
            pixelCount: finalPixelCount,
            imageFormat: imgFormat,
            isDefault: false,
          },
        });
      } else if (!existingCover.pixelCount && finalPixelCount) {
        await prisma.editionCover.update({
          where: { id: existingCover.id },
          data: {
            width: finalW,
            height: finalH,
            pixelCount: finalPixelCount,
            imageFormat: imgFormat,
          },
        });
      }

      const covers = await prisma.editionCover.findMany({
        where: { editionId },
      });

      if (covers.length > 0) {
        let bestCover = covers[0];
        let bestScore = -1;

        for (const c of covers) {
          const px = c.pixelCount || (c.width && c.height ? c.width * c.height : 0);
          const ratio = c.width && c.height ? c.width / c.height : 0;
          const isBookRatio = ratio >= 0.5 && ratio <= 0.85;
          const providerBonus = c.provider === "isbndb" ? 1000 : c.provider === "hardcover" ? 500 : 100;
          const score = px + (isBookRatio ? 2000 : 0) + providerBonus;

          if (score > bestScore) {
            bestScore = score;
            bestCover = c;
          }
        }

        await prisma.editionCover.updateMany({
          where: { editionId },
          data: { isDefault: false },
        });

        await prisma.editionCover.update({
          where: { id: bestCover.id },
          data: { isDefault: true },
        });
      }
    }
  }

  // 8. Provider Mapping
  if (providerWorkId || providerEditionId) {
    await prisma.providerMapping
      .upsert({
        where: {
          provider_providerWorkId: {
            provider,
            providerWorkId: providerWorkId || "",
          },
        },
        update: { workId, editionId: editionId || undefined },
        create: {
          provider,
          providerWorkId: providerWorkId || null,
          providerEditionId: providerEditionId || null,
          workId,
          editionId: editionId || null,
        },
      })
      .catch(() => {});
  }

  // 9. Register Redis Lookups
  await registerCanonicalLookups({
    workId,
    isbns: [isbn13, isbn10, asin],
    providerWorkIds: providerWorkId ? [{ provider, id: providerWorkId }] : [],
  });

  return workId;
}

/**
 * Score and rank top editions for a Canonical Work (returns up to `limit` editions).
 */
export function getRankedTopEditions(
  editions: any[],
  userLang: string = "en",
  limit: number = 5
): any[] {
  if (!editions || editions.length === 0) return [];

  const scored = editions.map((ed) => {
    let score = 0;
    const hasCover = ed.covers && ed.covers.length > 0;
    if (hasCover) score += 50;
    if (ed.language === userLang) score += 30;
    if (ed.isDefault) score += 20;
    if (ed.isbn13) score += 10;
    return { ed, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: any[] = [];
  const seenFormats = new Set<string>();

  for (const item of scored) {
    if (selected.length >= limit) break;
    const formatKey = `${item.ed.language}:${item.ed.format}`;
    if (!seenFormats.has(formatKey) || selected.length < 3) {
      selected.push(item.ed);
      seenFormats.add(formatKey);
    }
  }

  return selected;
}
