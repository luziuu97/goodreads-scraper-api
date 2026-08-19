import { prisma } from "@/lib/db";
import { getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
import { normalizeValidIsbn } from "@/lib/canonical/constants";

const LOOKUP_TTL = 30 * 24 * 60 * 60; // 30 days

export function normalizeIsbn(isbn: string): string {
  return normalizeValidIsbn(isbn) || "";
}

/**
 * Resolve canonical workId and editionId by ISBN or ASIN.
 */
export async function resolveCanonicalByIsbn(
  rawIsbn: string
): Promise<{ workId: string; editionId: string | null } | null> {
  const cleanIsbn = normalizeIsbn(rawIsbn);
  if (!cleanIsbn) return null;

  const redisKey = `lookup:isbn:${cleanIsbn}`;
  const cached = await getCachedResponse(redisKey);
  if (cached?.workId) {
    return cached;
  }

  // Query Prisma DB
  const editions = await prisma.edition.findMany({
    where: {
      OR: [
        { isbn13: cleanIsbn },
        { isbn10: cleanIsbn },
        { asin: cleanIsbn },
      ],
    },
    select: {
      id: true,
      workId: true,
      work: {
        select: {
          popularityScore: true,
          ratingsCount: true,
        },
      },
    },
    take: 20,
  });

  if (editions.length === 0) return null;

  const workIds = new Set(editions.map((edition) => edition.workId));
  if (workIds.size > 1) {
    console.warn("Ambiguous canonical ISBN lookup", { isbn: cleanIsbn, workIds: [...workIds] });
  }

  const edition = editions.reduce((best, candidate) => {
    const bestPop = best.work?.popularityScore ?? -1;
    const candidatePop = candidate.work?.popularityScore ?? -1;
    if (candidatePop !== bestPop) return candidatePop > bestPop ? candidate : best;
    return (candidate.work?.ratingsCount ?? 0) > (best.work?.ratingsCount ?? 0)
      ? candidate
      : best;
  });

  const result = { workId: edition.workId, editionId: edition.id };
  await setCachedResponse(redisKey, result, LOOKUP_TTL);
  return result;
}

/**
 * Resolve canonical workId by provider work ID.
 */
export async function resolveCanonicalByProviderWorkId(
  provider: string,
  providerWorkId: string
): Promise<string | null> {
  if (!providerWorkId) return null;

  const redisKey = `lookup:provider:${provider}:work:${providerWorkId}`;
  const cached = await getCachedResponse(redisKey);
  if (cached?.workId) {
    return cached.workId;
  }

  const mapping = await prisma.workExternalId.findUnique({
    where: {
      provider_externalId: { provider, externalId: providerWorkId },
    },
    select: {
      workId: true,
    },
  });

  if (mapping?.workId) {
    await setCachedResponse(redisKey, { workId: mapping.workId }, LOOKUP_TTL);
    return mapping.workId;
  }

  return null;
}

/**
 * Write lookup mappings to Redis for fast future lookups.
 */
export async function registerCanonicalLookups(input: {
  workId: string;
  isbns?: (string | null | undefined)[];
  providerWorkIds?: { provider: string; id: string }[];
}): Promise<void> {
  const { workId, isbns, providerWorkIds } = input;

  if (isbns) {
    for (const rawIsbn of isbns) {
      if (!rawIsbn) continue;
      const clean = normalizeIsbn(rawIsbn);
      if (clean) {
        await setCachedResponse(`lookup:isbn:${clean}`, { workId }, LOOKUP_TTL);
      }
    }
  }

  if (providerWorkIds) {
    for (const p of providerWorkIds) {
      if (p.provider && p.id) {
        await setCachedResponse(
          `lookup:provider:${p.provider}:work:${p.id}`,
          { workId },
          LOOKUP_TTL
        );
      }
    }
  }
}
