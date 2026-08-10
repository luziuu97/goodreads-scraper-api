import { normalizedTitleKey, normalizeTitle } from '../lib/normalize';

describe('Work title normalization', () => {
  test('\'Juego de Tronos\' normalizes to same key as \'juego de tronos\'', () => {
    expect(normalizedTitleKey('Juego de Tronos')).toBe(normalizedTitleKey('juego de tronos'));
  });
  test('strips diacritics for normalized key', () => {
    expect(normalizedTitleKey('Canción')).toBe('cancion');
  });
  test('trims whitespace', () => {
    expect(normalizedTitleKey('  Title  ')).toBe('title');
  });
  test('collapses internal spaces', () => {
    expect(normalizedTitleKey('A   Game    of   Thrones')).toBe('a game of thrones');
  });
  test('original display title is preserved by normalizeTitle', () => {
    // Assuming normalizeTitle cleans up display title but doesn't lowercase/strip diacritics like normalizedTitleKey does.
    expect(normalizeTitle('  A Game of Thrones  ')).toBe('A Game of Thrones');
    expect(normalizeTitle('Juego de Tronos')).toBe('Juego de Tronos');
  });
});
