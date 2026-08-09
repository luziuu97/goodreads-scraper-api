/**
 * ISO language definitions and normalization helpers for book metadata APIs.
 * Supports ISO 639-1 (2-letter), ISO 639-2 (3-letter), and English language names.
 */

export type LanguageDefinition = {
  iso639_1: string;
  iso639_2: string;
  name: string;
  nativeName: string;
};

export const ACCEPTED_LANGUAGES: LanguageDefinition[] = [
  { iso639_1: "en", iso639_2: "eng", name: "English", nativeName: "English" },
  { iso639_1: "es", iso639_2: "spa", name: "Spanish", nativeName: "Español" },
  { iso639_1: "fr", iso639_2: "fre", name: "French", nativeName: "Français" },
  { iso639_1: "de", iso639_2: "ger", name: "German", nativeName: "Deutsch" },
  { iso639_1: "it", iso639_2: "ita", name: "Italian", nativeName: "Italiano" },
  { iso639_1: "pt", iso639_2: "por", name: "Portuguese", nativeName: "Português" },
  { iso639_1: "nl", iso639_2: "dut", name: "Dutch", nativeName: "Nederlands" },
  { iso639_1: "ru", iso639_2: "rus", name: "Russian", nativeName: "Русский" },
  { iso639_1: "zh", iso639_2: "chi", name: "Chinese", nativeName: "中文" },
  { iso639_1: "ja", iso639_2: "jpn", name: "Japanese", nativeName: "日本語" },
  { iso639_1: "ko", iso639_2: "kor", name: "Korean", nativeName: "한국어" },
  { iso639_1: "ar", iso639_2: "ara", name: "Arabic", nativeName: "العربية" },
  { iso639_1: "hi", iso639_2: "hin", name: "Hindi", nativeName: "हिन्दी" },
  { iso639_1: "tr", iso639_2: "tur", name: "Turkish", nativeName: "Türkçe" },
  { iso639_1: "pl", iso639_2: "pol", name: "Polish", nativeName: "Polski" },
  { iso639_1: "sv", iso639_2: "swe", name: "Swedish", nativeName: "Svenska" },
  { iso639_1: "da", iso639_2: "dan", name: "Danish", nativeName: "Dansk" },
  { iso639_1: "fi", iso639_2: "fin", name: "Finnish", nativeName: "Suomi" },
  { iso639_1: "no", iso639_2: "nor", name: "Norwegian", nativeName: "Norsk" },
  { iso639_1: "cs", iso639_2: "cze", name: "Czech", nativeName: "Čeština" },
  { iso639_1: "hu", iso639_2: "hun", name: "Hungarian", nativeName: "Magyar" },
  { iso639_1: "ro", iso639_2: "ron", name: "Romanian", nativeName: "Română" },
  { iso639_1: "el", iso639_2: "gre", name: "Greek", nativeName: "Ελληνικά" },
  { iso639_1: "he", iso639_2: "heb", name: "Hebrew", nativeName: "עברית" },
  { iso639_1: "th", iso639_2: "tha", name: "Thai", nativeName: "ไทย" },
  { iso639_1: "id", iso639_2: "ind", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { iso639_1: "vi", iso639_2: "vie", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { iso639_1: "uk", iso639_2: "ukr", name: "Ukrainian", nativeName: "Українська" },
  { iso639_1: "fa", iso639_2: "per", name: "Persian", nativeName: "فارسی" },
  { iso639_1: "ca", iso639_2: "cat", name: "Catalan", nativeName: "Català" },
  { iso639_1: "gl", iso639_2: "glg", name: "Galician", nativeName: "Galego" },
  { iso639_1: "eu", iso639_2: "baq", name: "Basque", nativeName: "Euskara" },
  { iso639_1: "la", iso639_2: "lat", name: "Latin", nativeName: "Latina" },
  { iso639_1: "ms", iso639_2: "may", name: "Malay", nativeName: "Bahasa Melayu" },
];

/** Map for fast lookup by iso 639-1, iso 639-2, or lowercase English name */
const LANGUAGE_LOOKUP = new Map<string, LanguageDefinition>();

ACCEPTED_LANGUAGES.forEach((lang) => {
  LANGUAGE_LOOKUP.set(lang.iso639_1.toLowerCase(), lang);
  LANGUAGE_LOOKUP.set(lang.iso639_2.toLowerCase(), lang);
  LANGUAGE_LOOKUP.set(lang.name.toLowerCase(), lang);
});

/**
 * Normalizes input language string to ISO 639-1 (2-letter code).
 * Returns lowercase 2-letter code if matched, or raw 2-letter input if valid, or null.
 */
export function toIso639_1(input?: string | null): string | null {
  if (!input) return null;
  const clean = input.trim().toLowerCase().split(/[-_]/)[0];
  const matched = LANGUAGE_LOOKUP.get(clean);
  if (matched) {
    return matched.iso639_1;
  }
  if (/^[a-z]{2}$/.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Normalizes input language string to ISO 639-2 (3-letter code).
 * Returns lowercase 3-letter code if matched, or raw 3-letter input if valid, or null.
 */
export function toIso639_2(input?: string | null): string | null {
  if (!input) return null;
  const clean = input.trim().toLowerCase().split(/[-_]/)[0];
  const matched = LANGUAGE_LOOKUP.get(clean);
  if (matched) {
    return matched.iso639_2;
  }
  if (/^[a-z]{3}$/.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Returns English language name for an ISO code/name if matched.
 */
export function getLanguageName(input?: string | null): string | null {
  if (!input) return null;
  const clean = input.trim().toLowerCase().split(/[-_]/)[0];
  const matched = LANGUAGE_LOOKUP.get(clean);
  return matched ? matched.name : null;
}

/**
 * Formats the entire accepted language definitions list as CSV content.
 */
export function generateLanguagesCsv(): string {
  const header = "iso_639_1,iso_639_2,name,native_name";
  const rows = ACCEPTED_LANGUAGES.map(
    (l) => `${l.iso639_1},${l.iso639_2},"${l.name}","${l.nativeName}"`
  );
  return [header, ...rows].join("\n");
}
