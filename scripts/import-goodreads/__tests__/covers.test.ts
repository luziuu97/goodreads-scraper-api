import { isPlaceholderCover } from '../lib/normalize';

describe('Cover URL validation', () => {
  const KNOWN_PLACEHOLDER = 'https://s.gr-assets.com/assets/nophoto/book/111x148-bcc042a9c91a29c1d680899eff700a03.png';
  const REAL_COVER = 'https://images.gr-assets.com/books/1436732693m/13496.jpg';

  test('rejects the specific Goodreads nophoto URL', () => {
    expect(isPlaceholderCover(KNOWN_PLACEHOLDER)).toBe(true);
  });
  test('accepts real cover URL', () => {
    expect(isPlaceholderCover(REAL_COVER)).toBe(false);
  });
  test('rejects empty string', () => {
    expect(isPlaceholderCover('')).toBe(true);
  });
  test('rejects null', () => {
    expect(isPlaceholderCover(null as any)).toBe(true);
  });
  test('rejects URLs containing /assets/', () => {
    expect(isPlaceholderCover('https://s.gr-assets.com/assets/something/else.jpg')).toBe(true);
  });
  test('rejects URLs containing nocover', () => {
    expect(isPlaceholderCover('https://images.gr-assets.com/nocover/123.jpg')).toBe(true);
  });
  test('rejects URLs containing placeholder', () => {
    expect(isPlaceholderCover('https://images.gr-assets.com/placeholder.jpg')).toBe(true);
  });
  test('accepts HTTPS image URLs from gr-assets.com (non-placeholder)', () => {
    expect(isPlaceholderCover('https://images.gr-assets.com/books/123/456.png')).toBe(false);
  });
});
