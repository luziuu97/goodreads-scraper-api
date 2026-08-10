import { normalizeIsbn, isPlaceholderCover, normalizeContributorRole, normalizePublicationDate, safeInt, normalizeLanguageCode, normalizeBookFormat } from '../lib/normalize';

describe('normalizeIsbn', () => {
  test('returns null for empty string', () => {
    expect(normalizeIsbn('')).toBeNull();
  });
  test('returns null for spaces only', () => {
    expect(normalizeIsbn('   ')).toBeNull();
  });
  test('strips hyphens from ISBN-13', () => {
    expect(normalizeIsbn('978-3-16-148410-0')).toBe('9783161484100');
  });
  test('strips hyphens from ISBN-10', () => {
    expect(normalizeIsbn('0-9752298-0-X')).toBe('097522980X');
  });
  test('returns null for wrong length', () => {
    expect(normalizeIsbn('12345')).toBeNull();
    expect(normalizeIsbn('123456789012345')).toBeNull();
  });
  test('handles ISBN-10 with X check digit', () => {
    expect(normalizeIsbn('097522980X')).toBe('097522980X');
  });
  test('returns null for null/undefined', () => {
    expect(normalizeIsbn(null as any)).toBeNull();
    expect(normalizeIsbn(undefined as any)).toBeNull();
  });
});

describe('isPlaceholderCover', () => {
  test('detects nophoto URL - the specific Goodreads pattern', () => {
    expect(isPlaceholderCover('https://s.gr-assets.com/assets/nophoto/book/111x148-bcc042a9c91a29c1d680899eff700a03.png')).toBe(true);
  });
  test('detects URL with /assets/', () => {
    expect(isPlaceholderCover('https://s.gr-assets.com/assets/books/placeholder.png')).toBe(true);
  });
  test('returns true for null/empty', () => {
    expect(isPlaceholderCover('')).toBe(true);
    expect(isPlaceholderCover(null as any)).toBe(true);
  });
  test('returns false for real cover URL', () => {
    expect(isPlaceholderCover('https://images.gr-assets.com/books/1436732693m/13496.jpg')).toBe(false);
  });
  test('detects nocover in URL', () => {
    expect(isPlaceholderCover('https://images.gr-assets.com/books/nocover.jpg')).toBe(true);
  });
});

describe('normalizeContributorRole', () => {
  test('empty string -> AUTHOR, not edition-specific', () => {
    expect(normalizeContributorRole('')).toEqual({ role: 'AUTHOR', isEditionSpecific: false });
  });
  test('null -> AUTHOR, not edition-specific', () => {
    expect(normalizeContributorRole(null as any)).toEqual({ role: 'AUTHOR', isEditionSpecific: false });
  });
  test('Translator -> TRANSLATOR, edition-specific', () => {
    expect(normalizeContributorRole('Translator')).toEqual({ role: 'TRANSLATOR', isEditionSpecific: true });
  });
  test('Narrator -> NARRATOR, edition-specific', () => {
    expect(normalizeContributorRole('Narrator')).toEqual({ role: 'NARRATOR', isEditionSpecific: true });
  });
  test('Illustrator -> ILLUSTRATOR, not edition-specific', () => {
    expect(normalizeContributorRole('Illustrator')).toEqual({ role: 'ILLUSTRATOR', isEditionSpecific: false });
  });
  test('Editor -> EDITOR, edition-specific', () => {
    expect(normalizeContributorRole('Editor')).toEqual({ role: 'EDITOR', isEditionSpecific: true });
  });
  test('Adaptation -> ADAPTATION, edition-specific', () => {
    expect(normalizeContributorRole('Adaptation')).toEqual({ role: 'ADAPTATION', isEditionSpecific: true });
  });
  test('unknown role -> CONTRIBUTOR, edition-specific', () => {
    expect(normalizeContributorRole('RandomRole')).toEqual({ role: 'CONTRIBUTOR', isEditionSpecific: true });
  });
  test('case-insensitive matching', () => {
    expect(normalizeContributorRole('translator')).toEqual({ role: 'TRANSLATOR', isEditionSpecific: true });
    expect(normalizeContributorRole('TRANSLATOR')).toEqual({ role: 'TRANSLATOR', isEditionSpecific: true });
  });
});

describe('normalizeLanguageCode', () => {
  test('eng -> en', () => {
    expect(normalizeLanguageCode('eng')).toBe('en');
  });
  test('spa -> es', () => {
    expect(normalizeLanguageCode('spa')).toBe('es');
  });
  test('fra -> fr', () => {
    expect(normalizeLanguageCode('fra')).toBe('fr');
  });
  test('empty -> und', () => {
    expect(normalizeLanguageCode('')).toBe('und');
  });
  test('null -> und', () => {
    expect(normalizeLanguageCode(null as any)).toBe('und');
  });
  test('does NOT convert unknown to en', () => {
    expect(normalizeLanguageCode('xyz')).toBe('xyz');
  });
});

describe('normalizePublicationDate', () => {
  test('full date: year, month, day', () => {
    expect(normalizePublicationDate('2020', '5', '15')).toBe('2020-05-15');
  });
  test('year and month only', () => {
    expect(normalizePublicationDate('2020', '5', '')).toBe('2020-05');
  });
  test('year only', () => {
    expect(normalizePublicationDate('2020', '', '')).toBe('2020');
  });
  test('null year -> null', () => {
    expect(normalizePublicationDate('', '5', '15')).toBeNull();
    expect(normalizePublicationDate(null as any, '5', '15')).toBeNull();
  });
  test('invalid year -> null', () => {
    expect(normalizePublicationDate('abc', '5', '15')).toBeNull();
  });
});

describe('safeInt', () => {
  test('valid string -> number', () => {
    expect(safeInt('123')).toBe(123);
  });
  test('empty string -> 0', () => {
    expect(safeInt('')).toBe(0);
  });
  test('null -> 0', () => {
    expect(safeInt(null as any)).toBe(0);
  });
  test('NaN string -> 0', () => {
    expect(safeInt('abc')).toBe(0);
  });
  test('float string -> truncated integer', () => {
    expect(safeInt('123.45')).toBe(123);
  });
});
