import {
  canonicalWorkToDetails,
  canonicalWorkToSearchBook,
} from '../../../lib/canonical/reader';

const PRODUCTION_HARDCOVER_SEARCH_KEYS = [
  'id',
  'provider',
  'title',
  'workTitle',
  'author',
  'cover',
  'rating',
  'publicationDate',
  'genres',
  'presentation',
] as const;

const PRODUCTION_DETAILS_BOOK_KEYS = [
  'id',
  'slug',
  'title',
  'author',
  'rating',
  'ratingsCount',
  'publicationYear',
  'genres',
  'matchedEdition',
  'editions',
  'translations',
  'series',
] as const;

const PRODUCTION_EDITION_KEYS = [
  'id',
  'workId',
  'title',
  'format',
  'language',
  'isbn10',
  'isbn13',
  'asin',
  'publisher',
  'publicationDate',
  'pages',
  'isDefault',
  'createdAt',
  'updatedAt',
  'covers',
  'providerMappings',
] as const;

const PRODUCTION_COVER_KEYS = [
  'id',
  'editionId',
  'provider',
  'url',
  'width',
  'height',
  'pixelCount',
  'imageFormat',
  'isDefault',
] as const;

const PRODUCTION_PROVIDER_MAPPING_KEYS = [
  'id',
  'provider',
  'providerWorkId',
  'providerEditionId',
  'workId',
  'editionId',
] as const;

const PRODUCTION_TRANSLATION_KEYS = ['id', 'workId', 'language', 'title', 'description'] as const;

function expectKeys(actual: Record<string, unknown>, required: readonly string[]) {
  for (const key of required) {
    expect(actual).toHaveProperty(key);
  }
}

function productionCompatWork() {
  return {
    id: '9e1aa92d-278d-4b4f-831b-f8df70963ca8',
    slug: 'harry-potter-and-the-philosopher-s-stone',
    canonicalTitle: "Harry Potter and the Philosopher's Stone",
    originalLanguage: 'en',
    averageRating: 4.281146098181107,
    ratingsCount: 10284,
    publicationYear: 1997,
    contributors: [
      {
        role: 'AUTHOR',
        isPrimary: true,
        author: { id: 'author-1', name: 'J.K. Rowling' },
      },
    ],
    seriesMemberships: [
      {
        position: 1,
        isPrimary: true,
        series: {
          id: 'series-1',
          slug: 'harry-potter',
          canonicalName: 'Harry Potter',
        },
      },
    ],
    translations: [
      {
        id: 'trans-en',
        workId: '9e1aa92d-278d-4b4f-831b-f8df70963ca8',
        language: 'en',
        title: "Harry Potter and the Philosopher's Stone",
        description: 'A letter arrives by owl.',
      },
      {
        id: 'trans-es',
        workId: '9e1aa92d-278d-4b4f-831b-f8df70963ca8',
        language: 'es',
        title: 'Harry Potter y la piedra filosofal',
        description: null,
      },
    ],
    titles: [],
    genres: [{ genre: { name: 'Fantasy' } }, { genre: { name: 'Fiction' } }],
    externalIds: [{ provider: 'hardcover', externalId: '328491' }],
    editions: [
      {
        id: '5de1456d-765f-42c4-b824-75db6b7700db',
        workId: '9e1aa92d-278d-4b4f-831b-f8df70963ca8',
        title: "Harry Potter And The Philosopher's Stone",
        format: 'OTHER',
        language: 'en',
        isbn10: '0074753274',
        isbn13: '9780074753279',
        asin: null,
        publisher: null,
        publicationDate: null,
        pages: null,
        isDefault: true,
        createdAt: new Date('2026-08-08T17:25:48.343Z'),
        updatedAt: new Date('2026-08-09T17:56:04.169Z'),
        covers: [
          {
            id: '04177694-e19f-4c50-9f79-bca89fbcdfb2',
            editionId: '5de1456d-765f-42c4-b824-75db6b7700db',
            provider: 'isbndb',
            url: 'https://images.isbndb.com/covers/16393733482214.jpg',
            width: 200,
            height: 248,
            pixelCount: 49600,
            imageFormat: 'jpeg',
            isDefault: true,
          },
        ],
        externalIds: [
          {
            id: '19494726-f508-444f-b080-02ed5469c071',
            provider: 'isbndb',
            externalId: '9780074753279',
          },
        ],
      },
    ],
  };
}

describe('production response compatibility', () => {
  test('hardcover-style search hits keep every production key', () => {
    const book = canonicalWorkToSearchBook(productionCompatWork());
    expectKeys(book as unknown as Record<string, unknown>, PRODUCTION_HARDCOVER_SEARCH_KEYS);
    expect(typeof book.author).toBe('string');
    expect(typeof book.rating).toBe('number');
    expect(book.presentation).toMatch(/^(work|edition|isbn)$/);
  });

  test('default details keep production dump keys and types', () => {
    const response = canonicalWorkToDetails(productionCompatWork(), undefined, '328491');
    const book = response.book as Record<string, any>;

    expectKeys(book, PRODUCTION_DETAILS_BOOK_KEYS);
    expect(typeof book.author).toBe('string');
    expect(typeof book.rating).toBe('number');
    expect(book.author).toBe('J.K. Rowling');

    expect(book.matchedEdition).toBeTruthy();
    expectKeys(book.matchedEdition, PRODUCTION_EDITION_KEYS);
    expect(book.matchedEdition.workId).toBe(book.id);
    expect(book.matchedEdition.createdAt).toBe('2026-08-08T17:25:48.343Z');
    expect(Array.isArray(book.matchedEdition.covers)).toBe(true);
    expect(book.matchedEdition.covers.length).toBeGreaterThan(0);
    expectKeys(book.matchedEdition.covers[0], PRODUCTION_COVER_KEYS);
    expect(Array.isArray(book.matchedEdition.providerMappings)).toBe(true);
    expect(book.matchedEdition.providerMappings.length).toBeGreaterThan(0);
    expectKeys(book.matchedEdition.providerMappings[0], PRODUCTION_PROVIDER_MAPPING_KEYS);
    expect(book.matchedEdition.providerMappings[0].providerWorkId).toBe('9780074753279');

    expect(Array.isArray(book.editions)).toBe(true);
    expectKeys(book.editions[0], PRODUCTION_EDITION_KEYS);
    expectKeys(book.editions[0].covers[0], PRODUCTION_COVER_KEYS);
    expectKeys(book.editions[0].providerMappings[0], PRODUCTION_PROVIDER_MAPPING_KEYS);

    expect(Array.isArray(book.translations)).toBe(true);
    expectKeys(book.translations[0], PRODUCTION_TRANSLATION_KEYS);
    expect(book.translations[0].workId).toBe(book.id);
  });

  test('does not adopt live-hardcover types on the default details path', () => {
    const book = canonicalWorkToDetails(productionCompatWork()).book as Record<string, any>;
    expect(Array.isArray(book.author)).toBe(false);
    expect(typeof book.rating).not.toBe('string');
    expect(Array.isArray(book.series)).toBe(true);
  });
});
