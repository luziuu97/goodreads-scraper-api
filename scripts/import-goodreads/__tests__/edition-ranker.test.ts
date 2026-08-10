import { rankEditionsForWork, RawEdition } from '../lib/edition-ranker';

function makeEdition(overrides: Partial<RawEdition>): RawEdition {
  return {
    book_id: '1',
    work_id: '1',
    title: 'Test Title',
    isbn: null,
    isbn13: null,
    format: 'Hardcover',
    language_code: 'eng',
    publication_year: '2000',
    image_url: 'https://images.gr-assets.com/books/123m/123.jpg',
    ratings_count: '1000',
    text_reviews_count: '100',
    authors: [],
    ...overrides
  };
}

describe('rankEditionsForWork', () => {
  test('bestBookId always gets slot 0 even if low-scored', () => {
    const e1 = makeEdition({ book_id: '1', ratings_count: '10' });
    const e2 = makeEdition({ book_id: '2', ratings_count: '1000' });
    const e3 = makeEdition({ book_id: '3', ratings_count: '500' });

    const ranked = rankEditionsForWork([e1, e2, e3], '1', 5);
    expect(ranked[0].book_id).toBe('1');
    expect(ranked[0]._isDefault).toBe(true);
  });

  test('enforces cap — returns at most N editions', () => {
    const editions = Array.from({ length: 10 }).map((_, i) => makeEdition({ book_id: `${i}`, ratings_count: `${100 - i}` }));
    const ranked = rankEditionsForWork(editions, '0', 5);
    expect(ranked).toHaveLength(5);
  });

  test('deduplicates identical normalized ISBN-13', () => {
    const e1 = makeEdition({ book_id: '1', isbn13: '978-0553103540', ratings_count: '1000' });
    const e2 = makeEdition({ book_id: '2', isbn13: '9780553103540', ratings_count: '500' });
    
    const ranked = rankEditionsForWork([e1, e2], '10', 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].book_id).toBe('1');
  });

  test('deduplicates identical normalized ISBN-10 when no ISBN-13', () => {
    const e1 = makeEdition({ book_id: '1', isbn: '0553103547', isbn13: '', ratings_count: '1000' });
    const e2 = makeEdition({ book_id: '2', isbn: '0553103547', isbn13: '', ratings_count: '500' });

    const ranked = rankEditionsForWork([e1, e2], '10', 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].book_id).toBe('1');
  });

  test('language diversity: does not give all slots to one language', () => {
    const editions = [
      makeEdition({ book_id: '1', language_code: 'eng', ratings_count: '1000' }),
      makeEdition({ book_id: '2', language_code: 'eng', ratings_count: '900' }),
      makeEdition({ book_id: '3', language_code: 'eng', ratings_count: '800' }),
      makeEdition({ book_id: '4', language_code: 'eng', ratings_count: '700' }),
      makeEdition({ book_id: '5', language_code: 'spa', ratings_count: '10' }),
    ];
    
    const ranked = rankEditionsForWork(editions, '0', 3);
    const languages = ranked.map(r => r.language_code);
    expect(languages).toContain('spa');
  });

  test('placeholder covers get lower score than real covers', () => {
    const real = makeEdition({ book_id: '1', image_url: 'https://images.gr-assets.com/books/123.jpg', ratings_count: '100' });
    const placeholder = makeEdition({ book_id: '2', image_url: 'https://s.gr-assets.com/assets/nophoto/book/111x148-bcc042a9c91a29c1d680899eff700a03.png', ratings_count: '200' });

    const ranked = rankEditionsForWork([placeholder, real], '0', 1);
    expect(ranked[0].book_id).toBe('1');
  });

  test('marks exactly one edition as isDefault', () => {
    const e1 = makeEdition({ book_id: '1' });
    const e2 = makeEdition({ book_id: '2' });
    const ranked = rankEditionsForWork([e1, e2], '10', 2);
    const defaults = ranked.filter(r => r._isDefault);
    expect(defaults).toHaveLength(1);
  });

  test('sets isDefault on bestBookId edition', () => {
    const e1 = makeEdition({ book_id: '1' });
    const e2 = makeEdition({ book_id: '2' });
    const ranked = rankEditionsForWork([e1, e2], '2', 2);
    expect(ranked.find(r => r.book_id === '2')?._isDefault).toBe(true);
  });

  test('sets isDefault on highest-scored edition when bestBookId not present', () => {
    const e1 = makeEdition({ book_id: '1', ratings_count: '10' });
    const e2 = makeEdition({ book_id: '2', ratings_count: '1000' });
    const ranked = rankEditionsForWork([e1, e2], '99', 2);
    expect(ranked.find(r => r.book_id === '2')?._isDefault).toBe(true);
  });

  test('empty editions array returns empty array', () => {
    expect(rankEditionsForWork([], '1', 5)).toHaveLength(0);
  });

  test('single edition is always selected', () => {
    const e = makeEdition({ book_id: '1' });
    const ranked = rankEditionsForWork([e], '2', 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]._isDefault).toBe(true);
  });

  test('unknown language (und) editions fill remaining slots after known languages', () => {
    const eng = makeEdition({ book_id: '1', language_code: 'eng', ratings_count: '10' });
    const und = makeEdition({ book_id: '2', language_code: '', ratings_count: '1000' });
    
    const ranked = rankEditionsForWork([eng, und], '0', 2);
    expect(ranked[0].book_id).toBe('1');
    expect(ranked[1].book_id).toBe('2');
  });
});
