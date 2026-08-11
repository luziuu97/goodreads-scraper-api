import { normalizeSearchText } from "@/lib/canonical/constants";
import { toIso639_1 } from "@/lib/languages";

function cleanTitleForMatch(title: string): string {
  return normalizeSearchText(title.replace(/\s*\([^)]*#\d+[^)]*\)/gi, ""));
}

function editionSelectionScore(
  edition: any,
  options: {
    requestedLanguage?: string;
    originalLanguage?: string | null;
    query?: string;
  }
): number {
  const editionLanguage = toIso639_1(edition.language);
  const requestedLanguage = toIso639_1(options.requestedLanguage);
  const originalLanguage = toIso639_1(options.originalLanguage);
  let score = 0;

  if (requestedLanguage && editionLanguage === requestedLanguage) score += 10_000;
  if (!requestedLanguage && editionLanguage === "en") score += 2_000;
  if (originalLanguage && editionLanguage === originalLanguage) score += 1_000;

  if (options.query && edition.title) {
    const query = cleanTitleForMatch(options.query);
    const title = cleanTitleForMatch(edition.title);
    if (query && title === query) score += 500;
    else if (query && title && (title.includes(query) || query.includes(title))) score += 250;
  }

  if (edition.isDefault) score += 200;
  if (edition.covers?.length) score += 100;
  if (edition.isbn13) score += 50;
  else if (edition.isbn10) score += 25;
  if (edition.publicationDate) score += 20;
  if (edition.publisher) score += 10;
  if (edition.format) score += 5;

  return score;
}

export function rankEditionsForPresentation<T>(
  editions: T[],
  options: {
    requestedLanguage?: string;
    originalLanguage?: string | null;
    query?: string;
  }
): T[] {
  return editions
    .map((edition, index) => ({
      edition,
      index,
      score: editionSelectionScore(edition, options),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ edition }) => edition);
}
