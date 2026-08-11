import {
  normalizeIsbn,
  isPlaceholderCover,
  safeInt,
  normalizeLanguageCode
} from './normalize';

export interface RawEdition {
  book_id: string;
  work_id: string;
  title: string;
  title_without_series: string;
  isbn: string;
  isbn13: string;
  asin: string;
  kindle_asin: string;
  is_ebook: string;
  format: string;
  language_code: string;
  publisher: string;
  num_pages: string;
  publication_year: string;
  publication_month: string;
  publication_day: string;
  description: string;
  image_url: string;
  ratings_count: string;
  text_reviews_count: string;
  average_rating: string;
  authors: Array<{ author_id: string; role: string }>;
  series: string[];
  edition_information: string;
  country_code: string;
  popular_shelves: Array<{ count: string; name: string }>;
  similar_books: string[];
  link: string;
  url: string;
}

export interface RankedEdition extends RawEdition {
  _score: number;
  _normalizedIsbn13: string | null;
  _normalizedIsbn10: string | null;
  _normalizedLanguage: string;
  _isDefault: boolean;
}

export function rankEditionsForWork(
  editions: RawEdition[],
  bestBookId: string,
  cap: number
): RankedEdition[] {
  if (editions.length === 0) return [];

  // 1. Score each edition
  let scoredEditions: RankedEdition[] = editions.map(ed => {
    const _normalizedIsbn13 = normalizeIsbn(ed.isbn13, 13);
    const _normalizedIsbn10 = normalizeIsbn(ed.isbn, 10);
    const _normalizedLanguage = normalizeLanguageCode(ed.language_code);

    let _score = 0;
    if (ed.book_id === bestBookId) _score += 10000;
    if (_normalizedIsbn13) _score += 100;
    if (_normalizedIsbn10) _score += 50;
    if (!isPlaceholderCover(ed.image_url)) _score += 75;
    if (_normalizedLanguage !== 'und') _score += 40;
    if (ed.format && ed.format.trim() !== '') _score += 20;
    if (ed.publisher && ed.publisher.trim() !== '') _score += 20;
    if (ed.publication_year && ed.publication_year.trim() !== '') _score += 15;
    if (ed.num_pages && ed.num_pages.trim() !== '') _score += 15;
    
    _score += Math.min(safeInt(ed.ratings_count) * 0.001, 50);

    return {
      ...ed,
      _score,
      _normalizedIsbn13,
      _normalizedIsbn10,
      _normalizedLanguage,
      _isDefault: false
    };
  });

  // 2. Deduplicate by normalized ISBN
  const deduped: RankedEdition[] = [];
  const seenIsbns = new Set<string>();

  // Sort by score descending to keep the best ones during dedup
  scoredEditions.sort((a, b) => b._score - a._score);

  for (const ed of scoredEditions) {
    const isbnKey = ed._normalizedIsbn13 || ed._normalizedIsbn10;
    if (isbnKey) {
      if (!seenIsbns.has(isbnKey)) {
        seenIsbns.add(isbnKey);
        deduped.push(ed);
      }
    } else {
      deduped.push(ed);
    }
  }

  // 3. Apply language-diverse cap enforcement
  const selectedEditions: RankedEdition[] = [];
  let remaining = [...deduped];

  // a. The edition with `book_id === bestBookId` always gets slot 0
  const bestBookIndex = remaining.findIndex(ed => ed.book_id === bestBookId);
  if (bestBookIndex !== -1 && cap > 0) {
    selectedEditions.push(remaining.splice(bestBookIndex, 1)[0]);
  }

  // b. Group remaining editions by _normalizedLanguage
  const langGroups = new Map<string, RankedEdition[]>();
  for (const ed of remaining) {
    const lang = ed._normalizedLanguage;
    if (!langGroups.has(lang)) {
      langGroups.set(lang, []);
    }
    langGroups.get(lang)!.push(ed);
  }

  // c. & d. Find representatives and sort languages by score
  const representatives = Array.from(langGroups.entries()).map(([lang, eds]) => {
    // eds are already sorted by score desc
    return { lang, bestEd: eds[0], allEds: eds };
  });
  representatives.sort((a, b) => b.bestEd._score - a.bestEd._score);

  // e. Fill slots round-robin by language
  let roundRobinAdded = true;
  while (selectedEditions.length < cap && roundRobinAdded) {
    roundRobinAdded = false;
    for (const group of representatives) {
      if (selectedEditions.length >= cap) break;
      if (group.allEds.length > 0) {
        selectedEditions.push(group.allEds.shift()!);
        roundRobinAdded = true;
      }
    }
  }

  // f. If cap not yet reached, fill remaining slots by score descending from all non-yet-selected
  if (selectedEditions.length < cap) {
    const leftover: RankedEdition[] = [];
    for (const group of representatives) {
      leftover.push(...group.allEds);
    }
    leftover.sort((a, b) => b._score - a._score);
    
    while (selectedEditions.length < cap && leftover.length > 0) {
      selectedEditions.push(leftover.shift()!);
    }
  }

  // 4. Set _isDefault
  if (selectedEditions.length > 0) {
    let defaultIdx = selectedEditions.findIndex(ed => ed.book_id === bestBookId);
    if (defaultIdx === -1) {
      // highest scored
      let maxScore = -1;
      for (let i = 0; i < selectedEditions.length; i++) {
        if (selectedEditions[i]._score > maxScore) {
          maxScore = selectedEditions[i]._score;
          defaultIdx = i;
        }
      }
    }
    selectedEditions[defaultIdx]._isDefault = true;
  }

  return selectedEditions;
}
