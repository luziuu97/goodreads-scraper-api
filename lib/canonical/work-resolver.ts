/**
 * Work identity resolution for search aggregation.
 *
 * Maps a provider search hit to a canonical work key using a priority chain:
 *  1. Provider work ID → WorkExternalId (Redis-backed)
 *  2. ISBN → Edition.workId            (Redis-backed)
 *  3. Normalized title + primary author → WorkTitle
 *  4. Synthetic slug fallback           (no DB hit needed)
 *
 * Resolution is read-only: this module never writes to the DB.
 */

import { prisma } from "@/lib/db";
import {
  resolveCanonicalByIsbn,
  resolveCanonicalByProviderWorkId,
} from "@/lib/canonical/resolver";
import type { NormalizedSearchBook } from "@/lib/providers/types";

export type WorkResolution = {
  workKey: string;
  /** "certain" = matched via provider ID or ISBN; "title-match" = normalized title+author; "synthetic" = no DB match. */
  confidence: "certain" | "title-match" | "synthetic";
};

/** Normalize a title string for comparison (lower-case, collapse whitespace, strip diacritics). */
export function normalizeWorkTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/\s*\([^)]*\)/g, "") // strip parenthetical qualifiers like (Standard Edition), (#1)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize an author name for comparison. */
export function normalizeAuthorName(author: string): string {
  return author
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a single provider search hit to a canonical work key.
 * Tries the DB but never throws — falls back to a synthetic key on any error.
 */
export async function resolveWorkKey(
  book: NormalizedSearchBook
): Promise<WorkResolution> {
  try {
    // 1. Provider work ID mapping (fastest — Redis-backed)
    if (book.id && book.provider) {
      const workId = await resolveCanonicalByProviderWorkId(
        book.provider,
        book.id
      );
      if (workId) {
        return { workKey: `work:${workId}`, confidence: "certain" };
      }
    }

    // 2. ISBN → edition → work (Redis-backed)
    const isbn = book.isbn ?? book.edition?.isbn ?? null;
    const isbn10 = book.isbn10 ?? book.edition?.isbn10 ?? null;
    for (const candidate of [isbn, isbn10]) {
      if (candidate) {
        const result = await resolveCanonicalByIsbn(candidate);
        if (result?.workId) {
          return { workKey: `work:${result.workId}`, confidence: "certain" };
        }
      }
    }

    // 3. Normalized title + primary author match in WorkTitle table
    const workTitle = book.workTitle?.trim() || book.title?.trim() || null;
    if (workTitle && book.author?.trim()) {
      const normTitle = normalizeWorkTitle(workTitle);

      const titleRow = await prisma.workTitle.findFirst({
        where: {
          normalizedTitle: normTitle,
          work: {
            contributors: {
              some: {
                isPrimary: true,
                author: {
                  name: {
                    contains: book.author.split(" ").pop() ?? book.author,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
        select: { workId: true },
      });

      if (titleRow?.workId) {
        return { workKey: `work:${titleRow.workId}`, confidence: "title-match" };
      }

      // Also try the canonical title directly on the Work table
      const workRow = await prisma.work.findFirst({
        where: {
          canonicalTitle: { equals: workTitle, mode: "insensitive" },
          contributors: {
            some: {
              isPrimary: true,
              author: {
                name: {
                  contains: book.author.split(" ").pop() ?? book.author,
                  mode: "insensitive",
                },
              },
            },
          },
        },
        select: { id: true },
      });

      if (workRow?.id) {
        return { workKey: `work:${workRow.id}`, confidence: "title-match" };
      }

      // Return synthetic key so hits for the same work cluster together
      // even when no DB record yet exists.
      const normAuthor = normalizeAuthorName(book.author);
      return {
        workKey: `syn:${normTitle}|${normAuthor}`,
        confidence: "synthetic",
      };
    }
  } catch {
    // DB unreachable or query failed — degrade gracefully
  }

  // 4. Synthetic fallback (title only or truly unknown)
  const fallbackTitle = normalizeWorkTitle(book.workTitle || book.title || book.id);
  const fallbackAuthor = normalizeAuthorName(book.author || "");
  return {
    workKey: `syn:${fallbackTitle}|${fallbackAuthor}`,
    confidence: "synthetic",
  };
}

/**
 * Resolve work keys for a batch of search hits concurrently.
 * Returns a parallel array of resolutions (same index as `books`).
 */
export async function resolveWorkKeys(
  books: NormalizedSearchBook[]
): Promise<WorkResolution[]> {
  const results = await Promise.allSettled(books.map(resolveWorkKey));
  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    // Individual failure → synthetic fallback
    const book = books[i];
    const t = normalizeWorkTitle(book.workTitle || book.title || book.id);
    const a = normalizeAuthorName(book.author || "");
    return { workKey: `syn:${t}|${a}`, confidence: "synthetic" as const };
  });
}
