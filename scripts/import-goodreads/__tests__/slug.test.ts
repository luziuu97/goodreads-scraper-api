import { makeSlug, makeUniqueSlug } from '../lib/slug';

describe('Slug generation', () => {
  test('basic ASCII title', () => {
    expect(makeSlug('A Game of Thrones')).toBe('a-game-of-thrones');
  });
  test('strips diacritics: \'Canción de hielo y fuego\' -> \'cancion-de-hielo-y-fuego\'', () => {
    expect(makeSlug('Canción de hielo y fuego')).toBe('cancion-de-hielo-y-fuego');
  });
  test('collapses multiple hyphens', () => {
    expect(makeSlug('Hello---World')).toBe('hello-world');
  });
  test('trims leading and trailing hyphens', () => {
    expect(makeSlug('-Hello World-')).toBe('hello-world');
  });
  test('truncates to 80 chars', () => {
    const longTitle = 'a'.repeat(100);
    const slug = makeSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toBe('a'.repeat(80));
  });
  test('empty title returns work-unknown', () => {
    expect(makeSlug('')).toBe('work-unknown');
  });
  test('makeUniqueSlug avoids collision by appending fallbackId', () => {
    const existing = new Set(['a-game-of-thrones']);
    expect(makeUniqueSlug('A Game of Thrones', '123', existing)).toBe('a-game-of-thrones-123');
  });
  test('makeUniqueSlug handles second collision by appending fallbackId-2', () => {
    const existing = new Set(['a-game-of-thrones', 'a-game-of-thrones-123']);
    // Actually the prompt says "makeUniqueSlug handles second collision by appending fallbackId-2"
    // so let's expect it to return "a-game-of-thrones-123-2" or something similar based on implementation.
    // I'll test basic collision resolution based on typical patterns.
    expect(makeUniqueSlug('A Game of Thrones', '123', existing)).toBe('a-game-of-thrones-123-2');
  });
});
