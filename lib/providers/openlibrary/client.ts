import type {
  BookCoversInput,
  BookDetailsInput,
  BookSearchInput,
  NormalizedBookCoversResponse,
  NormalizedBookDetailsResponse,
  NormalizedEditionCover,
  NormalizedSearchBook,
} from "@/lib/providers/types";

import { normalizeLanguage } from "@/lib/canonical/constants";
import { toIso639_1, toIso639_2 } from "@/lib/languages";

const OPEN_LIBRARY_BASE = "https://openlibrary.org";
const COVERS_BASE = "https://covers.openlibrary.org/b";

type OLSearchDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  ratings_average?: number;
  number_of_pages_median?: number;
  language?: string[];
  publisher?: string[];
  subject?: string[];
};

type OLSearchResponse = {
  numFound: number;
  docs: OLSearchDoc[];
};

type OLWorkResponse = {
  key: string;
  title: string;
  description?: string | { type?: string; value: string };
  covers?: number[];
  authors?: Array<{ author: { key: string }; type?: { key: string } }>;
  subjects?: string[];
  first_publish_date?: string;
};

type OLEditionDoc = {
  key: string;
  title?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string;
  languages?: Array<{ key: string }>;
};

type OLEditionsResponse = {
  entries: OLEditionDoc[];
};

function buildCoverUrl(coverId?: number, isbn?: string): string {
  if (coverId) {
    return `${COVERS_BASE}/id/${coverId}-L.jpg`;
  }
  if (isbn) {
    const clean = isbn.replace(/[^0-9Xx]/g, "");
    if (clean) {
      return `${COVERS_BASE}/isbn/${clean}-L.jpg`;
    }
  }
  return "";
}

function cleanWorkId(rawId: string): string {
  return rawId.replace(/^\/works\//, "").replace(/\/$/, "");
}

function normalizeIsbn(isbns?: string[]): { isbn13: string | null; isbn10: string | null } {
  if (!isbns || isbns.length === 0) {
    return { isbn13: null, isbn10: null };
  }
  let isbn13: string | null = null;
  let isbn10: string | null = null;

  for (const item of isbns) {
    const clean = item.replace(/[^0-9Xx]/g, "").toUpperCase();
    if (clean.length === 13 && !isbn13) {
      isbn13 = clean;
    } else if (clean.length === 10 && !isbn10) {
      isbn10 = clean;
    }
  }
  return { isbn13, isbn10 };
}

export async function searchOpenLibrary(
  input: BookSearchInput
): Promise<NormalizedSearchBook[]> {
  const queryParam = encodeURIComponent(input.query);
  const limit = Math.min(Math.max(input.limit || 20, 1), 50);
  const iso3Language = toIso639_2(input.language);
  const iso1Language = toIso639_1(input.language);

  let url = `${OPEN_LIBRARY_BASE}/search.json?q=${queryParam}&limit=${limit}`;
  if (iso3Language) {
    url += `&language=${encodeURIComponent(iso3Language)}`;
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": "goodreads-scraper-api/1.0 (+https://gdscraper.bookishnearby.com)",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Open Library search HTTP ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as OLSearchResponse;
  if (!data.docs || !Array.isArray(data.docs)) {
    return [];
  }

  return data.docs.map((doc) => {
    const workId = cleanWorkId(doc.key);
    const { isbn13, isbn10 } = normalizeIsbn(doc.isbn);
    const coverUrl = buildCoverUrl(doc.cover_i, isbn13 || isbn10 || undefined);

    return {
      id: workId,
      provider: "openlibrary",
      title: doc.title,
      workTitle: doc.title,
      author: doc.author_name?.[0] ?? "Unknown Author",
      cover: coverUrl,
      rating: doc.ratings_average ? Math.round(doc.ratings_average * 100) / 100 : undefined,
      publicationDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      genres: doc.subject?.slice(0, 10),
      isbn: isbn13,
      isbn10: isbn10,
      language: normalizeLanguage(doc.language?.[0]),
      languageCode: normalizeLanguage(doc.language?.[0]),
      presentation: "work",
      sources: [
        {
          title: "Open Library",
          url: `${OPEN_LIBRARY_BASE}${doc.key}`,
        },
      ],
    };
  });
}

async function fetchAuthorName(authorKey: string): Promise<string | null> {
  try {
    const cleanKey = authorKey.startsWith("/") ? authorKey : `/authors/${authorKey}`;
    const res = await fetch(`${OPEN_LIBRARY_BASE}${cleanKey}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.name || null;
  } catch {
    return null;
  }
}

export async function getOpenLibraryBookDetails(
  input: BookDetailsInput
): Promise<NormalizedBookDetailsResponse> {
  const workId = cleanWorkId(input.slug);
  const workUrl = `${OPEN_LIBRARY_BASE}/works/${workId}.json`;
  const editionsUrl = `${OPEN_LIBRARY_BASE}/works/${workId}/editions.json?limit=10`;

  const [workRes, editionsRes] = await Promise.all([
    fetch(workUrl, {
      headers: { "User-Agent": "goodreads-scraper-api/1.0" },
    }),
    fetch(editionsUrl, {
      headers: { "User-Agent": "goodreads-scraper-api/1.0" },
    }).catch(() => null),
  ]);

  if (!workRes.ok) {
    throw new Error(`Open Library work ${workId} HTTP ${workRes.status}`);
  }

  const work = (await workRes.json()) as OLWorkResponse;
  const editionsData = editionsRes?.ok ? ((await editionsRes.json()) as OLEditionsResponse) : null;

  // Resolve author
  let authorName = "Unknown Author";
  if (work.authors?.[0]?.author?.key) {
    const fetchedAuthor = await fetchAuthorName(work.authors[0].author.key);
    if (fetchedAuthor) {
      authorName = fetchedAuthor;
    }
  }

  // Primary cover & edition info
  const primaryCoverId = work.covers?.[0];
  const primaryEdition = editionsData?.entries?.[0];
  const { isbn13, isbn10 } = normalizeIsbn(
    primaryEdition?.isbn_13 || primaryEdition?.isbn_10
  );
  const coverUrl = buildCoverUrl(primaryCoverId, isbn13 || isbn10 || undefined);

  const description =
    typeof work.description === "string"
      ? work.description
      : work.description?.value ?? "";

  return {
    success: true,
    provider: "openlibrary",
    scrapedURL: `${OPEN_LIBRARY_BASE}/works/${workId}`,
    book: {
      id: workId,
      provider: "openlibrary",
      title: work.title,
      author: authorName,
      cover: coverUrl,
      description,
      genres: work.subjects?.slice(0, 15) ?? [],
      publicationDate: work.first_publish_date ?? null,
      rating: null,
      isbn: isbn13,
      isbn10: isbn10,
      pages: primaryEdition?.number_of_pages ?? null,
      publisher: primaryEdition?.publishers?.[0] ?? null,
      language: primaryEdition?.languages?.[0]?.key?.replace("/languages/", "") ?? null,
      format: primaryEdition?.physical_format ?? null,
      editionsCount: editionsData?.entries?.length ?? 1,
    },
  };
}

export async function getOpenLibraryCovers(
  input: BookCoversInput
): Promise<NormalizedBookCoversResponse> {
  const workId = cleanWorkId(input.slug);
  const limit = Math.min(Math.max(input.limit || 20, 1), 50);
  const editionsUrl = `${OPEN_LIBRARY_BASE}/works/${workId}/editions.json?limit=${limit}`;

  const res = await fetch(editionsUrl, {
    headers: { "User-Agent": "goodreads-scraper-api/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Open Library editions HTTP ${res.status}`);
  }

  const data = (await res.json()) as OLEditionsResponse;
  const entries = data.entries || [];

  const covers: NormalizedEditionCover[] = [];
  let editionCounter = 1;

  for (const entry of entries) {
    const coverId = entry.covers?.[0];
    const { isbn13, isbn10 } = normalizeIsbn(entry.isbn_13 || entry.isbn_10);
    const coverUrl = buildCoverUrl(coverId, isbn13 || isbn10 || undefined);

    if (input.onlyWithCover && !coverUrl) {
      continue;
    }

    covers.push({
      editionId: editionCounter,
      title: entry.title ?? null,
      url: coverUrl || "",
      width: 500,
      height: 800,
      ratio: 0.625,
      color: null,
      pixelCount: 400000,
      imageId: coverId ?? null,
      format: entry.physical_format ?? null,
      isbn: isbn13,
      isbn10: isbn10,
      asin: null,
      publicationDate: entry.publish_date ?? null,
      pages: entry.number_of_pages ?? null,
      publisher: entry.publishers?.[0] ?? null,
      language: entry.languages?.[0]?.key?.replace("/languages/", "") ?? null,
      languageCode: entry.languages?.[0]?.key?.replace("/languages/", "") ?? null,
      country: null,
      countryCode: null,
      isDefault: editionCounter === 1,
    });

    editionCounter++;
  }

  const bestByResolution = covers.length > 0 ? {
    editionId: covers[0].editionId,
    url: covers[0].url,
    width: covers[0].width,
    height: covers[0].height,
    pixelCount: covers[0].pixelCount,
  } : null;

  return {
    success: true,
    provider: "openlibrary",
    scrapedURL: `${OPEN_LIBRARY_BASE}/works/${workId}`,
    book: {
      id: workId,
      slug: workId,
      title: entries[0]?.title ?? workId,
      provider: "openlibrary",
    },
    covers,
    bestByResolution,
    totalCovers: covers.length,
    totalEditions: entries.length,
  };
}
