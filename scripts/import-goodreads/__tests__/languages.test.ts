import {
  canonicalizeLanguage,
  languageFields,
  languageFieldsFromParts,
  toIso639_1,
  toIso639_2,
  getLanguageName,
  parseLanguageParam,
} from '@/lib/languages';
import { normalizeLanguage, normalizeLanguageCode } from '@/lib/canonical/constants';

describe('canonicalizeLanguage', () => {
  test('maps ISO-639-1 codes', () => {
    expect(canonicalizeLanguage('es')).toEqual({
      code: 'es',
      name: 'Spanish',
      nativeName: 'Español',
    });
  });

  test('maps ISO-639-2 bibliographic and terminological codes', () => {
    expect(canonicalizeLanguage('spa')?.code).toBe('es');
    expect(canonicalizeLanguage('eng')?.code).toBe('en');
    expect(canonicalizeLanguage('fra')?.code).toBe('fr');
    expect(canonicalizeLanguage('fre')?.code).toBe('fr');
    expect(canonicalizeLanguage('deu')?.code).toBe('de');
    expect(canonicalizeLanguage('ger')?.code).toBe('de');
  });

  test('maps English and native display names', () => {
    expect(canonicalizeLanguage('Spanish')?.code).toBe('es');
    expect(canonicalizeLanguage('español')?.code).toBe('es');
    expect(canonicalizeLanguage('Español')?.code).toBe('es');
    expect(canonicalizeLanguage('Français')?.code).toBe('fr');
    expect(canonicalizeLanguage('English')?.code).toBe('en');
  });

  test('strips Open Library multi-name labels and BCP-47 regions', () => {
    expect(canonicalizeLanguage('Spanish; Castilian')?.code).toBe('es');
    expect(canonicalizeLanguage('es-MX')?.code).toBe('es');
    expect(canonicalizeLanguage('en_US')?.code).toBe('en');
    expect(canonicalizeLanguage('zh-Hans')?.code).toBe('zh');
  });

  test('handles common aliases', () => {
    expect(canonicalizeLanguage('castellano')?.code).toBe('es');
    expect(canonicalizeLanguage('castilian')?.code).toBe('es');
    expect(canonicalizeLanguage('inglés')?.code).toBe('en');
    expect(canonicalizeLanguage('farsi')?.code).toBe('fa');
  });

  test('returns null for empty / undetermined', () => {
    expect(canonicalizeLanguage(null)).toBeNull();
    expect(canonicalizeLanguage('')).toBeNull();
    expect(canonicalizeLanguage('und')).toBeNull();
    expect(canonicalizeLanguage('unknown')).toBeNull();
  });
});

describe('languageFields', () => {
  test('always returns English name + ISO-639-1 code', () => {
    expect(languageFields('español')).toEqual({
      language: 'Spanish',
      languageCode: 'es',
    });
    expect(languageFields('spa')).toEqual({
      language: 'Spanish',
      languageCode: 'es',
    });
    expect(languageFields('Spanish; Castilian')).toEqual({
      language: 'Spanish',
      languageCode: 'es',
    });
    expect(languageFields('eng')).toEqual({
      language: 'English',
      languageCode: 'en',
    });
  });

  test('prefers explicit code over display name', () => {
    expect(languageFieldsFromParts('English', 'es')).toEqual({
      language: 'Spanish',
      languageCode: 'es',
    });
  });
});

describe('toIso639 helpers', () => {
  test('toIso639_1', () => {
    expect(toIso639_1('español')).toBe('es');
    expect(toIso639_1('spa')).toBe('es');
    expect(toIso639_1('Spanish; Castilian')).toBe('es');
    expect(toIso639_1('und')).toBeNull();
  });

  test('toIso639_2', () => {
    expect(toIso639_2('es')).toBe('spa');
    expect(toIso639_2('Spanish')).toBe('spa');
  });

  test('getLanguageName', () => {
    expect(getLanguageName('es')).toBe('Spanish');
    expect(getLanguageName('español')).toBe('Spanish');
    expect(getLanguageName('spa')).toBe('Spanish');
  });

  test('parseLanguageParam', () => {
    expect(parseLanguageParam('es')).toBe('es');
    expect(parseLanguageParam('Spanish')).toBe('es');
    expect(parseLanguageParam('español')).toBe('es');
    expect(parseLanguageParam('original')).toBeNull();
    expect(parseLanguageParam('')).toBeNull();
    expect(parseLanguageParam('zz')).toBeNull();
  });
});

describe('constants wrappers', () => {
  test('normalizeLanguage returns English display name', () => {
    expect(normalizeLanguage('español')).toBe('Spanish');
    expect(normalizeLanguage('spa')).toBe('Spanish');
    expect(normalizeLanguage('und')).toBeNull();
  });

  test('normalizeLanguageCode returns ISO-639-1 or und', () => {
    expect(normalizeLanguageCode('eng')).toBe('en');
    expect(normalizeLanguageCode('spa')).toBe('es');
    expect(normalizeLanguageCode('fra')).toBe('fr');
    expect(normalizeLanguageCode('español')).toBe('es');
    expect(normalizeLanguageCode('Spanish; Castilian')).toBe('es');
    expect(normalizeLanguageCode('')).toBe('und');
    expect(normalizeLanguageCode(null as any)).toBe('und');
    expect(normalizeLanguageCode('xyz')).toBe('xyz');
  });
});
