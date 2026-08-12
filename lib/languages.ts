/**
 * ISO language definitions and normalization helpers for book metadata APIs.
 *
 * Accepts ISO 639-1, ISO 639-2 (B/T), BCP-47 tags, English names, native names,
 * and common aliases from external providers (Hardcover, Open Library, ISBNDB, etc.).
 *
 * Response contract:
 *   languageCode → always ISO 639-1 (e.g. "es")
 *   language     → always English display name (e.g. "Spanish")
 */

export type LanguageDefinition = {
  iso639_1: string;
  iso639_2: string;
  name: string;
  nativeName: string;
};

/** Canonical language fields for API responses. */
export type CanonicalLanguage = {
  code: string;
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

/**
 * Extra aliases that external services emit (ISO 639-2/T terminological codes,
 * regional names, open-library style labels, endonyms with/without accents).
 * Keys must be lowercase and accent-stripped where they contain Latin letters.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  // ISO 639-2/T (terminological) where they differ from bibliographic (B)
  fra: "fr",
  deu: "de",
  nld: "nl",
  zho: "zh",
  ces: "cs",
  ell: "el",
  fas: "fa",
  msa: "ms",
  eus: "eu",
  rum: "ro",
  // Common provider / regional labels
  castilian: "es",
  castellano: "es",
  espanol: "es",
  español: "es",
  "spanish castilian": "es",
  ingles: "en",
  inglés: "en",
  francais: "fr",
  français: "fr",
  portugues: "pt",
  português: "pt",
  "brazilian portuguese": "pt",
  "portuguese brazil": "pt",
  "bahasa indonesia": "id",
  "bahasa melayu": "ms",
  "simplified chinese": "zh",
  "traditional chinese": "zh",
  mandarin: "zh",
  cantonese: "zh",
  greek: "el",
  modern: "el",
  "modern greek": "el",
  farsi: "fa",
  nynorsk: "no",
  bokmal: "no",
  bokmål: "no",
  "norwegian bokmal": "no",
  "norwegian nynorsk": "no",
};

const UNDETERMINED = new Set([
  "und",
  "undetermined",
  "unknown",
  "zxx",
  "mul",
  "mis",
  "null",
  "none",
  "n/a",
  "na",
]);

/** Map for fast lookup by code, English name, native name, or alias. */
const LANGUAGE_LOOKUP = new Map<string, LanguageDefinition>();

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function registerLookupKey(key: string, lang: LanguageDefinition): void {
  const lower = key.toLowerCase().trim();
  if (!lower) return;
  LANGUAGE_LOOKUP.set(lower, lang);
  const stripped = stripDiacritics(lower);
  if (stripped !== lower) {
    LANGUAGE_LOOKUP.set(stripped, lang);
  }
}

ACCEPTED_LANGUAGES.forEach((lang) => {
  registerLookupKey(lang.iso639_1, lang);
  registerLookupKey(lang.iso639_2, lang);
  registerLookupKey(lang.name, lang);
  registerLookupKey(lang.nativeName, lang);
});

for (const [alias, iso1] of Object.entries(LANGUAGE_ALIASES)) {
  const lang = LANGUAGE_LOOKUP.get(iso1);
  if (lang) {
    registerLookupKey(alias, lang);
  }
}

/**
 * Clean a raw language string from an external source into a lookup key.
 * Handles BCP-47 tags (es-MX), Open Library labels (Spanish; Castilian),
 * and mixed punctuation.
 */
export function cleanLanguageInput(input?: string | null): string | null {
  if (!input) return null;
  let value = input.trim();
  if (!value) return null;

  // Drop parenthetical notes: "Spanish (Spain)" → "Spanish"
  value = value.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // Open Library / ISO multi-name: "Spanish; Castilian" → "Spanish"
  if (value.includes(";")) {
    value = value.split(";")[0].trim();
  }
  // BCP-47 / locale tags: "es-MX", "en_US", "zh-Hans" → primary subtag
  value = value.split(/[-_]/)[0].trim();

  const lower = value.toLowerCase();
  if (!lower || UNDETERMINED.has(lower)) return null;
  return lower;
}

function lookupDefinition(input?: string | null): LanguageDefinition | null {
  const clean = cleanLanguageInput(input);
  if (!clean) return null;

  const direct = LANGUAGE_LOOKUP.get(clean);
  if (direct) return direct;

  const stripped = stripDiacritics(clean);
  if (stripped !== clean) {
    const byStripped = LANGUAGE_LOOKUP.get(stripped);
    if (byStripped) return byStripped;
  }

  // Multi-word labels after partial clean: "spanish castilian"
  const spaced = stripped.replace(/[^a-z0-9]+/g, " ").trim();
  if (spaced && spaced !== stripped) {
    const bySpaced = LANGUAGE_LOOKUP.get(spaced);
    if (bySpaced) return bySpaced;
    // Prefer first token for "spanish language", etc.
    const first = spaced.split(/\s+/)[0];
    const byFirst = LANGUAGE_LOOKUP.get(first);
    if (byFirst) return byFirst;
  }

  return null;
}

/**
 * Resolve any provider language string into a canonical { code, name, nativeName }.
 * Returns null when the input is empty, undetermined, or unrecognized.
 */
export function canonicalizeLanguage(input?: string | null): CanonicalLanguage | null {
  const def = lookupDefinition(input);
  if (!def) return null;
  return {
    code: def.iso639_1,
    name: def.name,
    nativeName: def.nativeName,
  };
}

/**
 * Pair of fields for API responses and provider mappers.
 * languageCode is always ISO 639-1; language is always the English display name.
 */
export function languageFields(input?: string | null): {
  language: string | null;
  languageCode: string | null;
} {
  const canonical = canonicalizeLanguage(input);
  if (canonical) {
    return { language: canonical.name, languageCode: canonical.code };
  }

  // Preserve unrecognized ISO-639-1-looking codes so we don't drop rare languages.
  const clean = cleanLanguageInput(input);
  if (clean && /^[a-z]{2}$/.test(clean) && !UNDETERMINED.has(clean)) {
    return { language: null, languageCode: clean };
  }

  return { language: null, languageCode: null };
}

/**
 * Prefer an explicit code (provider ISO field) over a display name when both exist.
 */
export function languageFieldsFromParts(
  nameOrCode?: string | null,
  preferredCode?: string | null
): { language: string | null; languageCode: string | null } {
  const fromCode = preferredCode ? languageFields(preferredCode) : null;
  if (fromCode?.languageCode) {
    // Prefer English name from our table; fall back to provider name only if unknown.
    if (fromCode.language) return fromCode;
    const fromName = languageFields(nameOrCode);
    return {
      language: fromName.language,
      languageCode: fromCode.languageCode,
    };
  }
  return languageFields(nameOrCode || preferredCode);
}

/**
 * Normalizes input language string to ISO 639-1 (2-letter code).
 * Returns lowercase 2-letter code if matched, or raw 2-letter input if valid, or null.
 */
export function toIso639_1(input?: string | null): string | null {
  const canonical = canonicalizeLanguage(input);
  if (canonical) return canonical.code;

  const clean = cleanLanguageInput(input);
  if (clean && /^[a-z]{2}$/.test(clean) && !UNDETERMINED.has(clean)) {
    return clean;
  }
  return null;
}

/**
 * Normalizes input language string to ISO 639-2 (3-letter code).
 * Returns lowercase 3-letter code if matched, or raw 3-letter input if valid, or null.
 */
export function toIso639_2(input?: string | null): string | null {
  const def = lookupDefinition(input);
  if (def) return def.iso639_2;

  const clean = cleanLanguageInput(input);
  if (clean && /^[a-z]{3}$/.test(clean) && !UNDETERMINED.has(clean)) {
    return clean;
  }
  return null;
}

/**
 * Returns English language name for an ISO code/name if matched.
 */
export function getLanguageName(input?: string | null): string | null {
  return canonicalizeLanguage(input)?.name ?? null;
}

/** Native (endonym) display name when known. */
export function getLanguageNativeName(input?: string | null): string | null {
  return canonicalizeLanguage(input)?.nativeName ?? null;
}

/**
 * Validate API language input against the accepted language table.
 * Unlike toIso639_1, unknown 2-letter codes are rejected (returns null).
 */
export function parseLanguageParam(input?: string | null): string | null {
  if (!input?.trim()) return null;
  // "original" is a special filter, not a language
  if (input.trim().toLowerCase() === "original") return null;
  return canonicalizeLanguage(input)?.code ?? null;
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
