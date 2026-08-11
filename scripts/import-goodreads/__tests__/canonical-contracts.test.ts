import {
  isGoodreadsCoverUrl,
  normalizeSearchText,
  normalizeValidIsbn,
  pickBestCoverUrl,
} from '../../../lib/canonical/constants';
import { canonicalWorkToSearchBook } from '../../../lib/canonical/reader';
import { parseLanguageParam } from '../../../lib/languages';

describe('canonical metadata contracts', () => {
  test('accented and accentless translated titles share one key', () => {
    expect(normalizeSearchText('El Señor de los Anillos'))
      .toBe(normalizeSearchText('El Senor de los Anillos'));
  });

  test('normalizes punctuation and whitespace consistently', () => {
    expect(normalizeSearchText("  L’Anneau — Unique  ")).toBe('lanneau unique');
  });

  test('accepts valid ISBNs and rejects invalid checksums', () => {
    expect(normalizeValidIsbn('978-0-261-10325-2')).toBe('9780261103252');
    expect(normalizeValidIsbn('9780261103253')).toBeNull();
    expect(normalizeValidIsbn('0-261-10325-3')).toBe('0261103253');
  });

  test('normalizes ISO-1, ISO-3, and BCP-47 language input', () => {
    expect(parseLanguageParam('es')).toBe('es');
    expect(parseLanguageParam('spa')).toBe('es');
    expect(parseLanguageParam('es-ES')).toBe('es');
    expect(parseLanguageParam('zz')).toBeNull();
  });

  test('uses Goodreads covers only when no other service has a cover', () => {
    const goodreads = 'https://images.gr-assets.com/books/123/456.jpg';
    const openLibrary = 'https://covers.openlibrary.org/b/isbn/9780261103252-L.jpg';

    expect(isGoodreadsCoverUrl(goodreads)).toBe(true);
    expect(pickBestCoverUrl([goodreads, openLibrary])).toBe(openLibrary);
    expect(pickBestCoverUrl([goodreads])).toBe(goodreads);
  });

  test('does not let the preferred edition Goodreads cover eclipse another service', () => {
    const result = canonicalWorkToSearchBook({
      id: 'work-1',
      canonicalTitle: 'The Hobbit',
      originalLanguage: 'en',
      averageRating: 4.2,
      publicationYear: 1937,
      contributors: [{ isPrimary: true, author: { name: 'J. R. R. Tolkien' } }],
      seriesMemberships: [],
      translations: [],
      titles: [],
      genres: [],
      externalIds: [],
      editions: [
        {
          id: 'edition-1',
          title: 'The Hobbit',
          language: 'en',
          isDefault: true,
          isbn13: null,
          isbn10: null,
          covers: [{
            url: 'https://images.gr-assets.com/books/123/456.jpg',
            provider: 'goodreads-dataset',
          }],
        },
        {
          id: 'edition-2',
          title: 'The Hobbit',
          language: 'en',
          isDefault: false,
          isbn13: null,
          isbn10: null,
          covers: [{
            url: 'https://covers.openlibrary.org/b/id/12345-L.jpg',
            provider: 'openlibrary',
          }],
        },
      ],
    });

    expect(result.cover).toBe('https://covers.openlibrary.org/b/id/12345-L.jpg');
  });
});
