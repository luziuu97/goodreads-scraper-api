import { prisma } from "@/lib/db";
import {
  detectImageFormat,
  getCoverPriorityRank,
  isTextInLanguage,
  normalizeAuthorSlug,
  normalizeBookFormat,
  normalizeLanguageCode,
  normalizeAndRankCategories,
  parseAuthorNames,
} from "@/lib/canonical/constants";
import { registerCanonicalLookups } from "@/lib/canonical/resolver";
import { getImageDimensions } from "@/lib/utils/image-size";
import type { MetadataSourceId } from "@/lib/providers/types";

export type RawProviderBookInput = {
  provider: MetadataSourceId;
  providerWorkId?: string;
  providerEditionId?: string;
  title: string;
  originalTitle?: string | null;
  authorName?: string | null;
  description?: string | null;
  language?: string | null;
  publicationYear?: number | null;
  publicationDate?: string | null;
  publisher?: string | null;
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
  translators?: Array<{ name: string }>;
  illustrators?: Array<{ name: string }>;
  narrators?: Array<{ name: string }>;
  audioLengthMinutes?: number | null;
};

async function safeUpsertAuthor(name: string, rawSlug?: string) {
  const normSlug = normalizeAuthorSlug(name) || rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = await prisma.author.findUnique({ where: { slug: normSlug } });
  if (existing) return existing;
  try {
    return await prisma.author.upsert({
      where: { slug: normSlug },
      update: {},
      create: { name, slug: normSlug },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
        const reFound = await prisma.author.findUnique({ where: { slug: normSlug } });
        if (reFound) return reFound;
      }
      const reFoundByName = await prisma.author.findFirst({ where: { name } });
      if (reFoundByName) return reFoundByName;

      const fallbackSlug = `${normSlug}-${Math.random().toString(36).slice(2, 7)}`;
      return await prisma.author.create({
        data: { name, slug: fallbackSlug },
      });
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
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
        const reFound = await prisma.series.findUnique({ where: { slug } });
        if (reFound) return reFound;
      }
      const fallbackSlug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      return await prisma.series.create({
        data: { canonicalName: name, slug: fallbackSlug },
      });
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
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
        const reFound = await prisma.genre.findUnique({ where: { name } });
        if (reFound) return reFound;
      }
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
  const { primaryAuthor: parsedPrimaryAuthor, extraContributors: parsedExtras } = parseAuthorNames(authorName);
  const effectiveAuthorName = parsedPrimaryAuthor || authorName?.trim() || "";

  const canonicalTitleStr = originalTitle?.trim() || title.trim();
  const slugBase = [canonicalTitleStr, effectiveAuthorName, publicationYear]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slugStr = slugBase || `work-${provider}-${providerWorkId || providerEditionId || "unknown"}`;

  // 1. Resolve or Create Author
  let authorId: string | null = null;
  if (effectiveAuthorName) {
    const author = await safeUpsertAuthor(effectiveAuthorName);
    authorId = author.id;
  }

  // 2. Resolve or Create Series. Membership is attached after resolving the work.
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

  // 3. Resolve Work (via external work ID or edition identifiers).
  let existingWorkId: string | null = null;

  if (providerWorkId) {
    const map = await prisma.workExternalId.findUnique({
      where: { provider_externalId: { provider, externalId: providerWorkId } },
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

  // 3b. Title + primary author fallback: if the originalTitle (canonical English
  //     work title) matches an existing WorkTitle row AND the author matches,
  //     attach this as a new edition of that work instead of creating a duplicate.
  if (!existingWorkId && authorId) {
    const normalizedCanonical = canonicalTitleStr
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const titleMatch = await prisma.workTitle.findFirst({
      where: {
        normalizedTitle: normalizedCanonical,
        work: {
          contributors: {
            some: { authorId, isPrimary: true },
          },
        },
      },
      select: { workId: true },
    });

    if (titleMatch?.workId) {
      existingWorkId = titleMatch.workId;
    } else if (authorName?.trim()) {
      // Also try matching on the Work.canonicalTitle directly (handles the case
      // where WorkTitle rows haven't been written yet for this work).
      const authorLastName = authorName.trim().split(/\s+/).pop() ?? authorName.trim();
      const workMatch = await prisma.work.findFirst({
        where: {
          canonicalTitle: { equals: canonicalTitleStr, mode: "insensitive" },
          contributors: {
            some: {
              isPrimary: true,
              author: {
                name: { contains: authorLastName, mode: "insensitive" },
              },
            },
          },
        },
        select: { id: true },
      });
      if (workMatch?.id) existingWorkId = workMatch.id;
    }
  }

  // 4. Create or Update Work
  let workId: string;
  if (existingWorkId) {
    workId = existingWorkId;
    await prisma.work.update({
      where: { id: workId },
      data: {
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
        },
      });
      workId = newWork.id;
    } catch (err: any) {
      if (err?.code === "P2002") {
        const reFoundWork = await prisma.work.findUnique({ where: { slug: slugStr } });
        if (reFoundWork) {
          workId = reFoundWork.id;
        } else {
          const suffix = `${providerWorkId || providerEditionId || Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
          const newWork = await prisma.work.create({
            data: {
              slug: `${slugStr}-${suffix}`,
              canonicalTitle: canonicalTitleStr,
              originalLanguage: langCode,
              publicationYear,
              averageRating: rating,
              ratingsCount,
            },
          });
          workId = newWork.id;
        }
      } else {
        throw err;
      }
    }
  }

  if (authorId) {
    await prisma.workContributor.upsert({
      where: { workId_authorId_role: { workId, authorId, role: "AUTHOR" } },
      update: { isPrimary: true, position: 0 },
      create: { workId, authorId, role: "AUTHOR", isPrimary: true, position: 0 },
    });
  }

  if (Array.isArray(parsedExtras)) {
    for (const extra of parsedExtras) {
      if (extra?.name?.trim()) {
        const extraAuthor = await safeUpsertAuthor(extra.name.trim());
        await prisma.workContributor.upsert({
          where: { workId_authorId_role: { workId, authorId: extraAuthor.id, role: extra.role || "AUTHOR" } },
          update: {},
          create: { workId, authorId: extraAuthor.id, role: extra.role || "AUTHOR", isPrimary: false, position: 1 },
        });
      }
    }
  }

  if (Array.isArray(input.translators)) {
    for (const t of input.translators) {
      if (t?.name?.trim()) {
        const tSlug = t.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const tAuthor = await safeUpsertAuthor(t.name.trim(), tSlug);
        await prisma.workContributor.upsert({
          where: { workId_authorId_role: { workId, authorId: tAuthor.id, role: "TRANSLATOR" } },
          update: {},
          create: { workId, authorId: tAuthor.id, role: "TRANSLATOR", isPrimary: false, position: 1 },
        });
      }
    }
  }

  if (Array.isArray(input.illustrators)) {
    for (const ill of input.illustrators) {
      if (ill?.name?.trim()) {
        const illSlug = ill.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const illAuthor = await safeUpsertAuthor(ill.name.trim(), illSlug);
        await prisma.workContributor.upsert({
          where: { workId_authorId_role: { workId, authorId: illAuthor.id, role: "ILLUSTRATOR" } },
          update: {},
          create: { workId, authorId: illAuthor.id, role: "ILLUSTRATOR", isPrimary: false, position: 2 },
        });
      }
    }
  }

  if (Array.isArray(input.narrators)) {
    for (const nar of input.narrators) {
      if (nar?.name?.trim()) {
        const narSlug = nar.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const narAuthor = await safeUpsertAuthor(nar.name.trim(), narSlug);
        await prisma.workContributor.upsert({
          where: { workId_authorId_role: { workId, authorId: narAuthor.id, role: "NARRATOR" } },
          update: {},
          create: { workId, authorId: narAuthor.id, role: "NARRATOR", isPrimary: false, position: 3 },
        });
      }
    }
  }

  if (seriesId) {
    await prisma.workSeries.upsert({
      where: { workId_seriesId: { workId, seriesId } },
      update: { position: seriesPosition, isPrimary: true },
      create: { workId, seriesId, position: seriesPosition, isPrimary: true },
    });
  }

  // 5. Work Translation
  if (title || description) {
    const validLanguageDesc = isTextInLanguage(description, langCode) ? description?.trim() : undefined;
    const existingTrans = await prisma.workTranslation.findUnique({
      where: { workId_language: { workId, language: langCode } },
    });
    const finalDesc = validLanguageDesc || (existingTrans?.description && isTextInLanguage(existingTrans.description, langCode) ? existingTrans.description : null);

    await prisma.workTranslation.upsert({
      where: {
        workId_language: { workId, language: langCode },
      },
      update: {
        title: title.trim(),
        description: finalDesc || undefined,
      },
      create: {
        workId,
        language: langCode,
        title: title.trim(),
        description: finalDesc || null,
      },
    });

    const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
    await prisma.workTitle.upsert({
      where: {
        workId_language_normalizedTitle: {
          workId,
          language: langCode,
          normalizedTitle,
        },
      },
      update: { title: title.trim() },
      create: {
        workId,
        language: langCode,
        title: title.trim(),
        normalizedTitle,
        isPrimary: title.trim() === canonicalTitleStr,
        source: provider,
      },
    });
  }

  // 6. Merging Genres (Top 5 clean categories)
  if (genres && genres.length > 0) {
    const validGenres = normalizeAndRankCategories(genres, 5);
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
    const mappedEdition = providerEditionId
      ? await prisma.editionExternalId.findUnique({
          where: { provider_externalId: { provider, externalId: providerEditionId } },
          include: { edition: true },
        })
      : null;
    const existingEdition = mappedEdition?.edition || (isbn13 || isbn10 || asin
      ? await prisma.edition.findFirst({
          where: {
            workId,
            OR: [
              ...(isbn13 ? [{ isbn13 }] : []),
              ...(isbn10 ? [{ isbn10 }] : []),
              ...(asin ? [{ asin }] : []),
            ],
          },
        })
      : null);

    if (existingEdition) {
      editionId = existingEdition.id;
      await prisma.edition.update({
        where: { id: editionId },
        data: {
          publisher: publisher || existingEdition.publisher || undefined,
          publicationDate: publicationDate || existingEdition.publicationDate || undefined,
          pages: typeof pages === "number" && pages > 0 ? pages : (existingEdition.pages || undefined),
          audioLengthMinutes: typeof input.audioLengthMinutes === "number" && input.audioLengthMinutes > 0 ? input.audioLengthMinutes : (existingEdition.audioLengthMinutes || undefined),
          format: bookFormat || existingEdition.format || undefined,
          language: langCode !== "und" ? langCode : (existingEdition.language || undefined),
          isbn10: isbn10 || existingEdition.isbn10 || undefined,
          isbn13: isbn13 || existingEdition.isbn13 || undefined,
        },
      });
    } else {
      const editionCount = await prisma.edition.count({ where: { workId } });
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
          audioLengthMinutes: input.audioLengthMinutes || null,
          isDefault: editionCount === 0,
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
          const providerRankBonus = getCoverPriorityRank(c.provider) === 1 ? 5000000 : getCoverPriorityRank(c.provider) === 2 ? 1000000 : 0;
          const score = providerRankBonus + px + (isBookRatio ? 2000 : 0);

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

  // 8. External source mappings. Work and edition identities are independent.
  if (providerWorkId) {
    await prisma.workExternalId.upsert({
      where: {
        provider_externalId: {
          provider,
          externalId: providerWorkId,
        },
      },
      update: { workId },
      create: {
        provider,
        externalId: providerWorkId,
        workId,
      },
    });
  }
  if (providerEditionId && editionId) {
    await prisma.editionExternalId.upsert({
      where: {
        provider_externalId: { provider, externalId: providerEditionId },
      },
      update: { editionId },
      create: {
        provider,
        externalId: providerEditionId,
        editionId,
      },
    });
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
