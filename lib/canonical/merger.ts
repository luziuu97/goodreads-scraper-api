import { prisma } from "@/lib/db";
import {
  calculatePopularityScore,
  detectImageFormat,
  getCoverPriorityRank,
  htmlToMarkdown,
  authorsAgree,
  isIgnoredAuthor,
  isTextInLanguage,
  normalizeAuthorSlug,
  normalizeBookFormat,
  normalizeLanguageCode,
  normalizeSearchText,
  normalizeValidIsbn,
  normalizeAndRankCategories,
  parseAuthorNames,
} from "@/lib/canonical/constants";
import { registerCanonicalLookups } from "@/lib/canonical/resolver";
import { getImageDimensions } from "@/lib/utils/image-size";
import type { MetadataSourceId } from "@/lib/providers/types";
import { isTrustedStructuralProvider } from "@/lib/canonical/authority";

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
  reviewsCount?: number | null;
  textReviewsCount?: number | null;
  genres?: string[];
  seriesName?: string | null;
  seriesPosition?: number | null;
  seriesDescription?: string | null;
  translators?: Array<{ name: string }>;
  illustrators?: Array<{ name: string }>;
  narrators?: Array<{ name: string }>;
  audioLengthMinutes?: number | null;
  country?: string | null;
  countryCode?: string | null;
  editions?: Array<{
    providerEditionId?: string | null;
    isbn10?: string | null;
    isbn13?: string | null;
    asin?: string | null;
    title?: string | null;
    format?: string | null;
    language?: string | null;
    publisher?: string | null;
    publicationDate?: string | null;
    pages?: number | null;
    coverUrl?: string | null;
    country?: string | null;
    countryCode?: string | null;
  }>;
};

async function safeUpsertAuthor(name: string, rawSlug?: string) {
  const normSlug = normalizeAuthorSlug(name) || rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (isIgnoredAuthor(null, name, normSlug)) return null;
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
  const existingBySlug = await prisma.series.findUnique({ where: { slug } });
  if (existingBySlug) return existingBySlug;

  const existingByName = await prisma.series.findFirst({
    where: { canonicalName: { equals: name, mode: "insensitive" } },
    orderBy: { booksCount: "desc" },
  });
  if (existingByName) {
    const importSuffixed = /-[0-9]{3,}$/.test(existingByName.slug);
    if (importSuffixed && existingByName.slug !== slug) {
      const slugTaken = await prisma.series.findUnique({ where: { slug } });
      if (!slugTaken) {
        try {
          return await prisma.series.update({
            where: { id: existingByName.id },
            data: { slug },
          });
        } catch {
          return existingByName;
        }
      }
    }
    return existingByName;
  }

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
        const reFoundByName = await prisma.series.findFirst({
          where: { canonicalName: { equals: name, mode: "insensitive" } },
        });
        if (reFoundByName) return reFoundByName;
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
  let validIsbn10 = normalizeValidIsbn(isbn10);
  let validIsbn13 = normalizeValidIsbn(isbn13);
  const countryName = input.country?.trim() || null;
  const countryCode = input.countryCode?.trim()?.toLowerCase() || null;

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
    if (author) authorId = author.id;
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

  if (!existingWorkId && (validIsbn13 || validIsbn10 || asin)) {
    const edition = await prisma.edition.findFirst({
      where: {
        OR: [
          ...(validIsbn13 ? [{ isbn13: validIsbn13 }] : []),
          ...(validIsbn10 ? [{ isbn10: validIsbn10 }] : []),
          ...(asin ? [{ asin }] : []),
        ],
      },
      include: {
        work: {
          include: {
            titles: true,
            translations: true,
            editions: { select: { title: true } },
            contributors: { include: { author: true } },
          },
        },
      },
    });
    if (edition) {
      const incomingTitle = normalizeSearchText(canonicalTitleStr);
      const knownTitles = [
        edition.work.canonicalTitle,
        ...edition.work.titles.map((item) => item.title),
        ...edition.work.translations.map((item) => item.title),
        ...edition.work.editions.map((item) => item.title),
      ].map(normalizeSearchText);
      const titleAgrees = knownTitles.some(
        (known) => known === incomingTitle || known.includes(incomingTitle) || incomingTitle.includes(known)
      );
      const authorAgrees =
        !effectiveAuthorName.trim() ||
        edition.work.contributors.some((item) =>
          authorsAgree(effectiveAuthorName, item.author.name)
        );

      // An ISBN/ASIN already in the catalog is edition identity. Translated
      // titles (e.g. Spanish vs English Harry Potter) must stay on that work.
      existingWorkId = edition.workId;

      if (!authorAgrees && !titleAgrees) {
        const conflict = {
          isbn13: validIsbn13,
          isbn10: validIsbn10,
          incomingTitle: canonicalTitleStr,
          existingTitle: edition.work.canonicalTitle,
          existingWorkId: edition.workId,
          provider,
        };
        console.warn("Canonical ISBN matched an existing work with different title/author; keeping mapping", conflict);
        await prisma.dataConflict.create({
          data: {
            type: "ISBN_METADATA_MISMATCH",
            identifier: validIsbn13 || validIsbn10 || "unknown",
            existingWorkId: edition.workId,
            provider,
            incomingData: conflict,
          },
        }).catch((error) => console.error("Failed to persist data conflict", error));
      }
    }
  }

  // 3b. Title + primary author fallback: if the originalTitle (canonical English
  //     work title) matches an existing WorkTitle row AND the author matches,
  //     attach this as a new edition of that work instead of creating a duplicate.
  if (!existingWorkId && authorId) {
    const normalizedCanonical = normalizeSearchText(canonicalTitleStr);

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
  const revCount = input.reviewsCount ?? input.textReviewsCount ?? null;
  const computedPopScore = calculatePopularityScore(ratingsCount, rating, revCount);

  if (existingWorkId) {
    workId = existingWorkId;
    // Trusted structural providers may correct a dirty canonical title left by
    // backup ingest (e.g. Amazon parenthetical series titles from ISBNDB).
    const titleUpdate =
      isTrustedStructuralProvider(provider) && canonicalTitleStr
        ? { canonicalTitle: canonicalTitleStr }
        : {};
    await prisma.work.update({
      where: { id: workId },
      data: {
        ...titleUpdate,
        publicationYear: publicationYear || undefined,
        averageRating: rating || undefined,
        ratingsCount: ratingsCount || undefined,
        reviewsCount: revCount || undefined,
        textReviewsCount: revCount || undefined,
        popularityScore: computedPopScore || undefined,
      },
    });
  } else {
    try {
      const workOriginalLang =
        langCode !== "en" && isTextInLanguage(canonicalTitleStr, "en")
          ? "en"
          : langCode;

      const newWork = await prisma.work.create({
        data: {
          slug: slugStr,
          canonicalTitle: canonicalTitleStr,
          originalLanguage: workOriginalLang,
          publicationYear,
          averageRating: rating,
          ratingsCount,
          reviewsCount: revCount,
          textReviewsCount: revCount,
          popularityScore: computedPopScore,
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

  // Authoritative author set from trusted providers replaces polluted fragments
  // (e.g. "Sakavic" / "Nora" left by ISBNDB "Last, First" splits).
  const trustedAuthorReplace = isTrustedStructuralProvider(provider) && Boolean(authorId);

  if (authorId) {
    await prisma.workContributor.upsert({
      where: { workId_authorId_role: { workId, authorId, role: "AUTHOR" } },
      update: { isPrimary: true, position: 0 },
      create: { workId, authorId, role: "AUTHOR", isPrimary: true, position: 0 },
    });
  }

  const keptAuthorIds = new Set<string>();
  if (authorId) keptAuthorIds.add(authorId);

  if (Array.isArray(parsedExtras)) {
    let position = 1;
    for (const extra of parsedExtras) {
      if (extra?.name?.trim()) {
        const extraAuthor = await safeUpsertAuthor(extra.name.trim());
        if (extraAuthor) {
          keptAuthorIds.add(extraAuthor.id);
          await prisma.workContributor.upsert({
            where: { workId_authorId_role: { workId, authorId: extraAuthor.id, role: extra.role || "AUTHOR" } },
            update: { isPrimary: false, position },
            create: { workId, authorId: extraAuthor.id, role: extra.role || "AUTHOR", isPrimary: false, position },
          });
          position += 1;
        }
      }
    }
  }

  if (trustedAuthorReplace && keptAuthorIds.size > 0) {
    const staleAuthors = await prisma.workContributor.findMany({
      where: { workId, role: "AUTHOR", authorId: { notIn: [...keptAuthorIds] } },
      select: { authorId: true },
    });
    if (staleAuthors.length > 0) {
      await prisma.workContributor.deleteMany({
        where: {
          workId,
          role: "AUTHOR",
          authorId: { in: staleAuthors.map((row) => row.authorId) },
        },
      });
    }
  }

  if (Array.isArray(input.translators)) {
    for (const t of input.translators) {
      if (t?.name?.trim()) {
        const tSlug = t.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const tAuthor = await safeUpsertAuthor(t.name.trim(), tSlug);
        if (tAuthor) {
          await prisma.workContributor.upsert({
            where: { workId_authorId_role: { workId, authorId: tAuthor.id, role: "TRANSLATOR" } },
            update: {},
            create: { workId, authorId: tAuthor.id, role: "TRANSLATOR", isPrimary: false, position: 1 },
          });
        }
      }
    }
  }

  if (Array.isArray(input.illustrators)) {
    for (const ill of input.illustrators) {
      if (ill?.name?.trim()) {
        const illSlug = ill.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const illAuthor = await safeUpsertAuthor(ill.name.trim(), illSlug);
        if (illAuthor) {
          await prisma.workContributor.upsert({
            where: { workId_authorId_role: { workId, authorId: illAuthor.id, role: "ILLUSTRATOR" } },
            update: {},
            create: { workId, authorId: illAuthor.id, role: "ILLUSTRATOR", isPrimary: false, position: 2 },
          });
        }
      }
    }
  }

  if (Array.isArray(input.narrators)) {
    for (const nar of input.narrators) {
      if (nar?.name?.trim()) {
        const narSlug = nar.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const narAuthor = await safeUpsertAuthor(nar.name.trim(), narSlug);
        if (narAuthor) {
          await prisma.workContributor.upsert({
            where: { workId_authorId_role: { workId, authorId: narAuthor.id, role: "NARRATOR" } },
            update: {},
            create: { workId, authorId: narAuthor.id, role: "NARRATOR", isPrimary: false, position: 3 },
          });
        }
      }
    }
  }

  if (seriesId) {
    const hasPosition =
      typeof seriesPosition === "number" && Number.isFinite(seriesPosition);
    await prisma.workSeries.upsert({
      where: { workId_seriesId: { workId, seriesId } },
      // Never wipe a known position with null (import often created NULL first).
      update: {
        ...(hasPosition ? { position: seriesPosition } : {}),
        isPrimary: true,
      },
      create: {
        workId,
        seriesId,
        position: hasPosition ? seriesPosition : null,
        isPrimary: true,
      },
    });
  }

  // 5. Work Translation
  if (title || description) {
    const rawDesc = description ? htmlToMarkdown(description) : undefined;
    const validLanguageDesc = rawDesc && isTextInLanguage(rawDesc, langCode) ? rawDesc : undefined;
    const existingTrans = await prisma.workTranslation.findUnique({
      where: { workId_language: { workId, language: langCode } },
    });
    const finalDesc = validLanguageDesc || (existingTrans?.description && isTextInLanguage(existingTrans.description, langCode) ? existingTrans.description : null);

    // Guard: do not overwrite an already-stored non-English translation title
    // with the canonical (English) work title.  This can happen when the same
    // work is re-ingested via the slug/English path after the translated title
    // has been correctly stored from an ISBN/edition-specific lookup.
    const incomingTitleEqualsCanonical =
      normalizeSearchText(title) === normalizeSearchText(canonicalTitleStr);
    const existingTitleIsTranslated =
      existingTrans?.title &&
      normalizeSearchText(existingTrans.title) !== normalizeSearchText(canonicalTitleStr);
    const shouldKeepExistingTitle =
      langCode !== "en" &&
      incomingTitleEqualsCanonical &&
      existingTitleIsTranslated;
    const finalTitle = shouldKeepExistingTitle
      ? existingTrans!.title
      : title.trim();

    await prisma.workTranslation.upsert({
      where: {
        workId_language: { workId, language: langCode },
      },
      update: {
        title: finalTitle,
        description: finalDesc || undefined,
      },
      create: {
        workId,
        language: langCode,
        title: finalTitle,
        description: finalDesc || null,
      },
    });

    // Cross-language description preservation: Hardcover (and most primary
    // providers) always return the synopsis in English regardless of the
    // edition language.  When we're ingesting a non-English edition, the
    // English description would otherwise be discarded (it fails the
    // isTextInLanguage check for the edition's langCode).  If the `en`
    // WorkTranslation already exists for this work, backfill its description
    // so canonicalWorkToDetails can surface it as a fallback.
    // We only UPDATE (never CREATE) to avoid creating an `en` row with a
    // non-English title — the English canonical row is created when the book
    // is requested via its English slug.
    if (
      langCode !== "en" &&
      description?.trim() &&
      isTextInLanguage(description, "en")
    ) {
      const enTrans = await prisma.workTranslation.findUnique({
        where: { workId_language: { workId, language: "en" } },
      });
      if (
        enTrans &&
        (!enTrans.description || !isTextInLanguage(enTrans.description, "en"))
      ) {
        await prisma.workTranslation.update({
          where: { workId_language: { workId, language: "en" } },
          data: { description: description.trim() },
        });
      }
    }

    const titleLang =
      langCode !== "en" &&
      normalizeSearchText(title) === normalizeSearchText(canonicalTitleStr) &&
      isTextInLanguage(canonicalTitleStr, "en")
        ? "en"
        : langCode;

    const normalizedTitle = normalizeSearchText(title);
    await prisma.workTitle.upsert({
      where: {
        workId_language_normalizedTitle: {
          workId,
          language: titleLang,
          normalizedTitle,
        },
      },
      update: { title: title.trim() },
      create: {
        workId,
        language: titleLang,
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
  if (validIsbn13 || validIsbn10 || asin || providerEditionId) {
    const mappedEdition = providerEditionId
      ? await prisma.editionExternalId.findUnique({
          where: { provider_externalId: { provider, externalId: providerEditionId } },
          include: { edition: true },
        })
      : null;
    const existingEdition = mappedEdition?.edition || (validIsbn13 || validIsbn10 || asin
      ? await prisma.edition.findFirst({
          where: {
            workId,
            OR: [
              ...(validIsbn13 ? [{ isbn13: validIsbn13 }] : []),
              ...(validIsbn10 ? [{ isbn10: validIsbn10 }] : []),
              ...(asin ? [{ asin }] : []),
            ],
          },
        })
      : null);

    if (existingEdition) {
      editionId = existingEdition.id;
      const editionTitleUpdate =
        isTrustedStructuralProvider(provider) && title?.trim()
          ? { title: title.trim() }
          : {};
      await prisma.edition.update({
        where: { id: editionId },
        data: {
          ...editionTitleUpdate,
          publisher: publisher || existingEdition.publisher || undefined,
          publicationDate: publicationDate || existingEdition.publicationDate || undefined,
          pages: typeof pages === "number" && pages > 0 ? pages : (existingEdition.pages || undefined),
          audioLengthMinutes: typeof input.audioLengthMinutes === "number" && input.audioLengthMinutes > 0 ? input.audioLengthMinutes : (existingEdition.audioLengthMinutes || undefined),
          format: bookFormat && bookFormat !== "OTHER" ? bookFormat : (existingEdition.format || undefined),
          language: langCode !== "und" ? langCode : (existingEdition.language || undefined),
          isbn10: validIsbn10 || existingEdition.isbn10 || undefined,
          isbn13: validIsbn13 || existingEdition.isbn13 || undefined,
          // Always backfill ASIN when the stored row is missing it.
          asin: asin || existingEdition.asin || undefined,
          country: countryName || existingEdition.country || undefined,
          countryCode: countryCode || existingEdition.countryCode || undefined,
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
          isbn10: validIsbn10,
          isbn13: validIsbn13,
          asin: asin || null,
          publisher: publisher || null,
          publicationDate: publicationDate || null,
          pages: pages || null,
          audioLengthMinutes: input.audioLengthMinutes || null,
          country: countryName,
          countryCode,
          isDefault: editionCount === 0,
        },
      });
      editionId = newEd.id;
    }

    // The first observed edition used to remain the default forever. Promote a
    // later English edition over a foreign default so read-through ingestion can
    // repair earlier provider-order accidents deterministically.
    if (editionId && langCode === "en") {
      const currentDefault = await prisma.edition.findFirst({
        where: { workId, isDefault: true },
        select: { id: true, language: true },
      });
      if (!currentDefault || normalizeLanguageCode(currentDefault.language) !== "en") {
        await prisma.edition.updateMany({
          where: { workId, isDefault: true },
          data: { isDefault: false },
        });
        await prisma.edition.update({
          where: { id: editionId },
          data: { isDefault: true },
        });
      }
    }
  }

  if (Array.isArray(input.editions)) {
    for (const ed of input.editions) {
      const edIsbn13 = normalizeValidIsbn(ed.isbn13);
      const edIsbn10 = normalizeValidIsbn(ed.isbn10);
      const edAsin = ed.asin?.trim() || null;
      const edProviderId = ed.providerEditionId?.trim() || null;
      // Allow identifier-less rows only when we have a stable provider edition id
      // (Hardcover often lists ebooks with no ISBN).
      if (!edIsbn13 && !edIsbn10 && !edAsin && !edProviderId) continue;

      const rawLang =
        typeof ed.language === "string"
          ? ed.language
          : (ed.language as any)?.code2 || (ed.language as any)?.language || null;
      const edLang = normalizeLanguageCode(rawLang);
      const edFormat = normalizeBookFormat(ed.format);
      const edTitle = ed.title?.trim() || title.trim();
      const edCountry = ed.country?.trim() || null;
      const edCountryCode = ed.countryCode?.trim()?.toLowerCase() || null;

      let existingEd =
        edProviderId
          ? (
              await prisma.editionExternalId.findUnique({
                where: {
                  provider_externalId: {
                    provider,
                    externalId: edProviderId,
                  },
                },
                include: { edition: true },
              })
            )?.edition || null
          : null;

      if (!existingEd && (edIsbn13 || edIsbn10 || edAsin)) {
        existingEd = await prisma.edition.findFirst({
          where: {
            workId,
            OR: [
              ...(edIsbn13 ? [{ isbn13: edIsbn13 }] : []),
              ...(edIsbn10 ? [{ isbn10: edIsbn10 }] : []),
              ...(edAsin ? [{ asin: edAsin }] : []),
            ],
          },
        });
      }

      let subEdId: string | null = null;
      if (existingEd) {
        subEdId = existingEd.id;
        await prisma.edition.update({
          where: { id: subEdId },
          data: {
            title: edTitle || existingEd.title || undefined,
            publisher: ed.publisher || existingEd.publisher || undefined,
            publicationDate: ed.publicationDate || existingEd.publicationDate || undefined,
            pages: typeof ed.pages === "number" && ed.pages > 0 ? ed.pages : (existingEd.pages || undefined),
            format: edFormat && edFormat !== "OTHER" ? edFormat : (existingEd.format || undefined),
            language: edLang !== "und" ? edLang : (existingEd.language || undefined),
            isbn10: edIsbn10 || existingEd.isbn10 || undefined,
            isbn13: edIsbn13 || existingEd.isbn13 || undefined,
            asin: edAsin || existingEd.asin || undefined,
            country: edCountry || existingEd.country || undefined,
            countryCode: edCountryCode || existingEd.countryCode || undefined,
          },
        });
      } else {
        const edCount = await prisma.edition.count({ where: { workId } });
        const createdEd = await prisma.edition.create({
          data: {
            workId,
            title: edTitle,
            format: edFormat,
            language: edLang,
            isbn10: edIsbn10,
            isbn13: edIsbn13,
            asin: edAsin,
            publisher: ed.publisher || null,
            publicationDate: ed.publicationDate || null,
            pages: ed.pages || null,
            country: edCountry,
            countryCode: edCountryCode,
            isDefault: edCount === 0,
          },
        });
        subEdId = createdEd.id;
      }

      if (subEdId && edProviderId) {
        await prisma.editionExternalId.upsert({
          where: {
            provider_externalId: { provider, externalId: edProviderId },
          },
          update: { editionId: subEdId },
          create: {
            provider,
            externalId: edProviderId,
            editionId: subEdId,
          },
        }).catch((err: any) => {
          if (err?.code !== "P2002") console.warn("Edition external id upsert failed:", err);
        });
      }

      if (subEdId && ed.coverUrl?.trim()) {
        const existingCover = await prisma.editionCover.findFirst({
          where: { editionId: subEdId, url: ed.coverUrl.trim() },
        });
        if (!existingCover) {
          try {
            await prisma.editionCover.create({
              data: {
                editionId: subEdId,
                provider,
                url: ed.coverUrl.trim(),
                isDefault: true,
              },
            });
          } catch (err: any) {
            if (err?.code !== "P2002") throw err;
          }
        }
      }
    }
  }

  // Upsert Cover Image & Calculate Dimensions
  if (editionId && coverUrl?.trim()) {
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
        try {
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
        } catch (err: any) {
          if (err?.code !== "P2002") throw err;
        }
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
    isbns: [validIsbn13, validIsbn10, asin],
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
