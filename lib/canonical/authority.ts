/**
 * Aggregate data-authority policy.
 *
 * Structural fields (title, authors, series, genres, identifiers, language)
 * come from trusted sources only:
 *   1. Canonical DB when the row is linked to Hardcover or the Goodreads dataset
 *   2. Hardcover (live)
 * Backup providers (ISBNDB, Open Library) may only fill fields trusted sources
 * left empty — they must never define work identity.
 *
 * Description is the exception. Hardcover repeats the English work synopsis on
 * every edition, so non-English presentations may take a matching-language
 * synopsis from backups. Hardcover English remains the fallback.
 */

import type { ProviderId } from "@/lib/providers/types";
import { isTextInLanguage } from "@/lib/canonical/constants";
import { toIso639_1 } from "@/lib/languages";

/** Providers allowed to define work identity / structural metadata. */
export const TRUSTED_STRUCTURAL_PROVIDERS = new Set<string>([
  "hardcover",
  "goodreads",
  "goodreads-dataset",
]);

/** Live providers that may introduce works during aggregate fan-out. */
export const LIVE_STRUCTURAL_PROVIDERS = new Set<ProviderId>(["hardcover"]);

/** Backup providers — gap-fill only. */
export const BACKUP_PROVIDERS = new Set<ProviderId>(["isbndb", "openlibrary"]);

export function isTrustedStructuralProvider(
  provider?: string | null
): boolean {
  if (!provider) return false;
  return TRUSTED_STRUCTURAL_PROVIDERS.has(provider);
}

export function isLiveStructuralProvider(provider?: string | null): boolean {
  if (!provider) return false;
  return LIVE_STRUCTURAL_PROVIDERS.has(provider as ProviderId);
}

export function isBackupProvider(provider?: string | null): boolean {
  if (!provider) return false;
  return BACKUP_PROVIDERS.has(provider as ProviderId);
}

/** External-id rows or search source labels that mark a work as trusted. */
export function workHasTrustedSource(work: {
  externalIds?: Array<{ provider?: string | null }> | null;
  sources?: Array<{ title?: string | null }> | null;
}): boolean {
  if (
    (work.externalIds || []).some((item) =>
      isTrustedStructuralProvider(item.provider)
    )
  ) {
    return true;
  }
  if (
    (work.sources || []).some((item) =>
      isTrustedStructuralProvider(item.title)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Local details short-circuit: only when a trusted source linked the work and
 * core presentation fields are populated. ISBNDB-only rows never pass.
 */
export function isTrustedLocalDetailsComplete(work: any): boolean {
  if (!work || !workHasTrustedSource(work)) return false;

  const primaryEdition = work.editions?.[0];
  const hasDescription = (work.translations || []).some(
    (t: any) => typeof t.description === "string" && t.description.trim()
  );
  const hasAuthor = (work.contributors || []).some(
    (c: any) =>
      c.role === "AUTHOR" &&
      c.author?.name &&
      String(c.author.name).trim()
  );
  const hasEditionIdentity = (work.editions || []).some(
    (ed: any) => ed.isbn13 || ed.isbn10 || ed.asin
  );
  // OTHER usually means we never ingested Hardcover reading_format / binding.
  // Force a refresh so ebooks don't stick as "paperback" forever.
  const hasKnownFormat = (work.editions || []).some(
    (ed: any) =>
      ed.format &&
      String(ed.format).toUpperCase() !== "OTHER" &&
      String(ed.format).toUpperCase() !== "UNKNOWN"
  );
  // Prefer multi-edition works once Hardcover sibling ingest has run.
  const hasSiblingEditions = (work.editions || []).length >= 2;

  // Goodreads import historically wrote WorkSeries.position as NULL for every
  // membership. Treat missing positions as incomplete so Hardcover can fill #1, #2, …
  const seriesMemberships = work.seriesMemberships || [];
  const seriesPositionsOk =
    seriesMemberships.length === 0 ||
    seriesMemberships.some(
      (m: any) => m.position != null && Number.isFinite(Number(m.position))
    );

  return Boolean(
    hasDescription &&
      hasAuthor &&
      hasEditionIdentity &&
      primaryEdition?.pages &&
      work.averageRating != null &&
      hasKnownFormat &&
      hasSiblingEditions &&
      seriesPositionsOk
  );
}

export function normalizeLookupIsbn(value?: string | null): string | null {
  if (!value) return null;
  const clean = String(value).replace(/[^0-9Xx]/g, "").toUpperCase();
  return clean.length === 10 || clean.length === 13 ? clean : null;
}

export function findEditionByIsbn(work: any, isbn: string | null | undefined) {
  if (!work || !isbn) return null;
  return (
    (work.editions || []).find((edition: any) =>
      [edition.isbn13, edition.isbn10, edition.asin].some(
        (value: unknown) => normalizeLookupIsbn(String(value || "")) === isbn
      )
    ) || null
  );
}

export function workHasDescriptionInLanguage(
  work: any,
  iso: string | null | undefined
): boolean {
  if (!work || !iso) return false;
  return (work.translations || []).some(
    (translation: any) =>
      toIso639_1(translation.language) === iso &&
      typeof translation.description === "string" &&
      translation.description.trim() &&
      isTextInLanguage(translation.description, iso)
  );
}

export function languageFromDetailsBook(book: any): string | null {
  if (!book) return null;
  return (
    toIso639_1(
      book.languageCode ||
        book.language ||
        book.edition?.languageCode ||
        (typeof book.edition?.language === "string"
          ? book.edition.language
          : book.edition?.language?.code2) ||
        ""
    ) || null
  );
}

/**
 * Language the details synopsis should be written in.
 * Explicit request > matched edition > backup edition > Hardcover edition > work original.
 */
export function resolveDetailsDescriptionLanguage(options: {
  requestedLanguage?: string | null;
  matchedEditionLanguage?: string | null;
  backupBookLanguages?: Array<string | null | undefined>;
  hardcoverLanguage?: string | null;
  originalLanguage?: string | null;
}): string | null {
  const first = (value?: string | null) =>
    value ? toIso639_1(value) || null : null;
  return (
    first(options.requestedLanguage) ||
    first(options.matchedEditionLanguage) ||
    options.backupBookLanguages?.map((value) => first(value || null)).find(Boolean) ||
    first(options.hardcoverLanguage) ||
    first(options.originalLanguage) ||
    null
  );
}

/**
 * Whether details must consult backups for a translated synopsis.
 * English presentations stay on Hardcover. Unknown ISBN language is checked
 * because Hardcover will not tell us the edition is translated.
 */
export function needsLocalizedDescriptionLookup(
  work: any,
  descriptionLanguage: string | null,
  slugIsIsbn: boolean
): boolean {
  if (descriptionLanguage && descriptionLanguage !== "en") {
    return !workHasDescriptionInLanguage(work, descriptionLanguage);
  }
  if (slugIsIsbn && !descriptionLanguage) return true;
  return false;
}

export function siblingIsbnsForLanguage(
  work: any,
  iso: string | null,
  requestedIsbn?: string | null,
  limit = 3
): string[] {
  if (!work || !iso) return requestedIsbn ? [requestedIsbn] : [];
  const isbns: string[] = [];
  if (requestedIsbn) isbns.push(requestedIsbn);
  for (const edition of work.editions || []) {
    if (toIso639_1(edition.language) !== iso) continue;
    const isbn = normalizeLookupIsbn(edition.isbn13) || normalizeLookupIsbn(edition.isbn10);
    if (isbn && !isbns.includes(isbn)) isbns.push(isbn);
    if (isbns.length >= limit) break;
  }
  return isbns.slice(0, limit);
}

/**
 * Search short-circuit for a single hit. Requires a trusted source marker and
 * basic presentation completeness (not merely "has an ISBN").
 */
export function isTrustedLocalSearchComplete(book: {
  cover?: string | null;
  rating?: number | null;
  isbn?: string | null;
  isbn10?: string | null;
  edition?: { isbn?: string | null; isbn10?: string | null; asin?: string | null } | null;
  author?: string | null;
  sources?: Array<{ title?: string | null }> | null;
  provider?: string | null;
}): boolean {
  const trusted =
    isTrustedStructuralProvider(book.provider) || workHasTrustedSource(book);
  if (!trusted) return false;
  if (!book.author || book.author === "Unknown Author") return false;
  const hasId =
    Boolean(book.isbn) ||
    Boolean(book.isbn10) ||
    Boolean(book.edition?.isbn) ||
    Boolean(book.edition?.isbn10) ||
    Boolean(book.edition?.asin);
  if (!hasId && book.rating == null) return false;
  return true;
}

/** Parse "All for the Game #1" / "Series Name #1.5" into name + position. */
export function parseSeriesLabel(raw?: string | null): {
  name: string | null;
  position: number | null;
} {
  if (!raw || !String(raw).trim()) return { name: null, position: null };
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^(.*?)(?:\s+#\s*(\d+(?:\.\d+)?)\s*.*)?$/);
  if (!match) return { name: trimmed, position: null };
  const name = match[1]?.trim() || trimmed;
  const position =
    match[2] != null && match[2] !== "" ? Number(match[2]) : null;
  return {
    name: name || null,
    position: Number.isFinite(position) ? position : null,
  };
}

/**
 * Collapse author fragments that are subsets of a longer name.
 * e.g. ["Sakavic", "Nora", "Nora Sakavic"] → ["Nora Sakavic"]
 */
export function collapseAuthorFragments<
  T extends { name?: string | null; id?: string | number | null }
>(authors: T[]): T[] {
  if (!Array.isArray(authors) || authors.length <= 1) return authors || [];

  const normalized = authors
    .map((a) => ({
      item: a,
      name: (a.name || "").trim(),
      tokens: new Set(
        (a.name || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((t) => t.length > 0)
      ),
    }))
    .filter((a) => a.name.length > 0);

  const keep: T[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const current = normalized[i];
    const absorbed = normalized.some((other, j) => {
      if (i === j) return false;
      if (other.name.length <= current.name.length) return false;
      // Every token of the shorter name appears in the longer one
      if (current.tokens.size === 0) return false;
      for (const token of current.tokens) {
        if (!other.tokens.has(token)) return false;
      }
      return true;
    });
    if (!absorbed) keep.push(current.item);
  }
  return keep;
}

/**
 * Extract a display author string from mixed provider shapes
 * (string | {name}[] | {name}).
 */
export function extractPrimaryAuthorName(author: unknown): string | null {
  if (typeof author === "string" && author.trim()) return author.trim();
  if (Array.isArray(author)) {
    for (const entry of author) {
      if (typeof entry === "string" && entry.trim()) return entry.trim();
      if (entry && typeof entry === "object" && typeof (entry as any).name === "string") {
        const name = (entry as any).name.trim();
        if (name) return name;
      }
    }
    return null;
  }
  if (author && typeof author === "object" && typeof (author as any).name === "string") {
    const name = (author as any).name.trim();
    return name || null;
  }
  return null;
}

export function extractAuthorList(
  author: unknown,
  authors?: unknown
): Array<{ id: string; name: string; role: string }> {
  const list: Array<{ id: string; name: string; role: string }> = [];
  const push = (entry: unknown, index: number) => {
    if (typeof entry === "string" && entry.trim()) {
      list.push({ id: String(index), name: entry.trim(), role: "AUTHOR" });
      return;
    }
    if (entry && typeof entry === "object") {
      const name = typeof (entry as any).name === "string" ? (entry as any).name.trim() : "";
      if (!name) return;
      list.push({
        id: String((entry as any).id ?? index),
        name,
        role: typeof (entry as any).role === "string" && (entry as any).role
          ? String((entry as any).role).toUpperCase()
          : "AUTHOR",
      });
    }
  };

  if (Array.isArray(authors)) {
    authors.forEach((entry, i) => push(entry, i));
  } else if (Array.isArray(author)) {
    author.forEach((entry, i) => push(entry, i));
  } else {
    const single = extractPrimaryAuthorName(author);
    if (single) list.push({ id: "0", name: single, role: "AUTHOR" });
  }

  return collapseAuthorFragments(list.filter((a) => a.role === "AUTHOR" || !a.role));
}
