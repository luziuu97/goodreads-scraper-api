/**
 * Canonical Constants & Normalizers for Books, Editions, Formats, and Languages.
 */

export const BOOK_FORMATS = [
  "HARDCOVER",
  "PAPERBACK",
  "MASS_MARKET",
  "EBOOK",
  "AUDIOBOOK",
  "OTHER",
] as const;

export type BookFormat = (typeof BOOK_FORMATS)[number];

/**
 * Standard ISO 639-1 Language Codes supported by the system.
 * Defaults to "en" when unspecified or unresolvable.
 */
export const SUPPORTED_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ja",
  "zh",
  "ru",
  "nl",
  "pl",
  "ko",
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number] | string;

/**
 * Normalize provider format strings into canonical BookFormat enum.
 */
export function normalizeBookFormat(rawFormat?: string | null): BookFormat {
  if (!rawFormat) return "OTHER";
  const norm = rawFormat.toLowerCase().trim();

  if (norm.includes("hardcover") || norm.includes("hardback") || norm.includes("tapa dura") || norm.includes("relie")) {
    return "HARDCOVER";
  }
  if (norm.includes("mass market")) {
    return "MASS_MARKET";
  }
  if (norm.includes("paperback") || norm.includes("softcover") || norm.includes("tapa blanda") || norm.includes("broché")) {
    return "PAPERBACK";
  }
  if (norm.includes("audio") || norm.includes("mp3") || norm.includes("cd") || norm.includes("audible")) {
    return "AUDIOBOOK";
  }
  if (norm.includes("ebook") || norm.includes("kindle") || norm.includes("digital") || norm.includes("epub") || norm.includes("pdf")) {
    return "EBOOK";
  }

  return "OTHER";
}

/**
 * Normalize language strings/codes into ISO 639-1 standard code (e.g., "Spanish" -> "es").
 */
export function normalizeLanguageCode(rawLang?: string | null): string {
  if (!rawLang) return "en";
  const norm = rawLang.toLowerCase().trim();

  if (norm.startsWith("es") || norm.includes("spanish") || norm.includes("español")) return "es";
  if (norm.startsWith("en") || norm.includes("english") || norm.includes("inglés")) return "en";
  if (norm.startsWith("fr") || norm.includes("french") || norm.includes("français")) return "fr";
  if (norm.startsWith("de") || norm.includes("german") || norm.includes("deutsch")) return "de";
  if (norm.startsWith("pt") || norm.includes("portuguese") || norm.includes("português")) return "pt";
  if (norm.startsWith("it") || norm.includes("italian") || norm.includes("italiano")) return "it";
  if (norm.startsWith("ja") || norm.includes("japanese")) return "ja";
  if (norm.startsWith("zh") || norm.includes("chinese")) return "zh";
  if (norm.startsWith("ru") || norm.includes("russian")) return "ru";
  if (norm.startsWith("nl") || norm.includes("dutch")) return "nl";
  if (norm.startsWith("pl") || norm.includes("polish")) return "pl";
  if (norm.startsWith("ko") || norm.includes("korean")) return "ko";

  // Return original ISO code if 2-3 letters, else fallback to "en"
  return norm.length <= 3 ? norm : "en";
}

/**
 * Image format detection based on URL extension or standard formats.
 */
export function detectImageFormat(url?: string | null): string {
  if (!url) return "jpeg";
  const lower = url.toLowerCase();
  if (lower.endsWith(".webp") || lower.includes("format=webp")) return "webp";
  if (lower.endsWith(".png") || lower.includes("format=png")) return "png";
  if (lower.endsWith(".gif")) return "gif";
  if (lower.endsWith(".avif")) return "avif";
  return "jpeg";
}
