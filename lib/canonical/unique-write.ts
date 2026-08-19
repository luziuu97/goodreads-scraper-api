import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

const inflight = new Map<string, Promise<unknown>>();

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "P2002" || code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isUniqueConstraintError(cause);
  return false;
}

export async function findOrCreateOnConflict<T>(options: {
  find: () => Promise<T | null>;
  create: () => Promise<T>;
  retries?: number;
  retryDelayMs?: number;
}): Promise<T> {
  const existing = await options.find();
  if (existing) return existing;
  try {
    return await options.create();
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    const retries = options.retries ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 50;
    for (let i = 0; i < retries; i++) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (i + 1)));
      const found = await options.find();
      if (found) return found;
    }
    throw err;
  }
}

export function withInflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

function missingAfterConflict(entity: string, key: string): Error & { code: string } {
  return Object.assign(new Error(`${entity} insert raced and vanished: ${key}`), {
    code: "P2002",
  });
}

export async function insertAuthorBySlug(name: string, slug: string) {
  return findOrCreateOnConflict({
    find: () => prisma.author.findUnique({ where: { slug } }),
    create: async () => {
      await prisma.$executeRaw`
        INSERT INTO "Author" ("id", "name", "slug")
        VALUES (${randomUUID()}, ${name}, ${slug})
        ON CONFLICT ("slug") DO NOTHING
      `;
      const row = await prisma.author.findUnique({ where: { slug } });
      if (!row) throw missingAfterConflict("Author", slug);
      return row;
    },
  });
}

export async function insertSeriesBySlug(canonicalName: string, slug: string) {
  return findOrCreateOnConflict({
    find: () => prisma.series.findUnique({ where: { slug } }),
    create: async () => {
      await prisma.$executeRaw`
        INSERT INTO "Series" ("id", "canonicalName", "slug")
        VALUES (${randomUUID()}, ${canonicalName}, ${slug})
        ON CONFLICT ("slug") DO NOTHING
      `;
      const row = await prisma.series.findUnique({ where: { slug } });
      if (!row) throw missingAfterConflict("Series", slug);
      return row;
    },
  });
}

export async function insertGenreByName(name: string) {
  return findOrCreateOnConflict({
    find: () => prisma.genre.findUnique({ where: { name } }),
    create: async () => {
      await prisma.$executeRaw`
        INSERT INTO "Genre" ("id", "name")
        VALUES (${randomUUID()}, ${name})
        ON CONFLICT ("name") DO NOTHING
      `;
      const row = await prisma.genre.findUnique({ where: { name } });
      if (!row) throw missingAfterConflict("Genre", name);
      return row;
    },
  });
}

export async function insertWorkBySlug(data: {
  slug: string;
  canonicalTitle: string;
  originalLanguage?: string | null;
  publicationYear?: number | null;
  averageRating?: number | null;
  ratingsCount?: number | null;
  reviewsCount?: number | null;
  textReviewsCount?: number | null;
  popularityScore?: number | null;
}) {
  return findOrCreateOnConflict({
    find: () => prisma.work.findUnique({ where: { slug: data.slug } }),
    create: async () => {
      await prisma.$executeRaw`
        INSERT INTO "Work" (
          "id", "slug", "canonicalTitle", "originalLanguage", "publicationYear",
          "averageRating", "ratingsCount", "reviewsCount", "textReviewsCount",
          "popularityScore", "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${data.slug}, ${data.canonicalTitle}, ${data.originalLanguage ?? null},
          ${data.publicationYear ?? null}, ${data.averageRating ?? null},
          ${data.ratingsCount ?? null}, ${data.reviewsCount ?? null},
          ${data.textReviewsCount ?? null}, ${data.popularityScore ?? null},
          NOW(), NOW()
        )
        ON CONFLICT ("slug") DO NOTHING
      `;
      const row = await prisma.work.findUnique({ where: { slug: data.slug } });
      if (!row) throw missingAfterConflict("Work", data.slug);
      return row;
    },
  });
}

export async function insertEditionCover(data: {
  editionId: string;
  provider: string;
  url: string;
  width?: number | null;
  height?: number | null;
  pixelCount?: number | null;
  imageFormat?: string | null;
  isDefault?: boolean;
}) {
  const existing = await prisma.editionCover.findUnique({
    where: { editionId_url: { editionId: data.editionId, url: data.url } },
  });
  if (existing) {
    if (!existing.pixelCount && data.pixelCount) {
      return prisma.editionCover.update({
        where: { id: existing.id },
        data: {
          width: data.width ?? undefined,
          height: data.height ?? undefined,
          pixelCount: data.pixelCount,
          imageFormat: data.imageFormat ?? undefined,
        },
      });
    }
    return existing;
  }

  await prisma.$executeRaw`
    INSERT INTO "EditionCover" (
      "id", "editionId", "provider", "url", "width", "height", "pixelCount",
      "imageFormat", "isDefault", "createdAt"
    )
    VALUES (
      ${randomUUID()}, ${data.editionId}, ${data.provider}, ${data.url},
      ${data.width ?? null}, ${data.height ?? null}, ${data.pixelCount ?? null},
      ${data.imageFormat ?? "jpeg"}, ${data.isDefault ?? false}, NOW()
    )
    ON CONFLICT ("editionId", "url") DO NOTHING
  `;
  const row = await prisma.editionCover.findUnique({
    where: { editionId_url: { editionId: data.editionId, url: data.url } },
  });
  if (!row) throw missingAfterConflict("EditionCover", `${data.editionId}:${data.url}`);
  return row;
}
