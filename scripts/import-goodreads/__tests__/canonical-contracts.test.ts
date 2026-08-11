import {
  normalizeSearchText,
  normalizeValidIsbn,
} from '../../../lib/canonical/constants';
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
});
