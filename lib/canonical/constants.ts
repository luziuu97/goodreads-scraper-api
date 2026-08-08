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

const RUBBISH_TAG_PATTERNS = [
  /^read-in-\d+$/i,
  /^read-\d+$/i,
  /^favorites?$/i,
  /^owned(-books)?$/i,
  /^books-i-own$/i,
  /^kindle(-unlimited)?$/i,
  /^tbr$/i,
  /^dnf$/i,
  /^currently-reading$/i,
  /^shelfari/i,
  /^goodreads/i,
  /^to-read$/i,
  /^wishlist$/i,
  /^library(-book)?$/i,
  /^listened-to$/i,
  /^\d+$/,
];

const POPULAR_SUBJECT_WEIGHTS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(fiction|literary fiction)\b/i, weight: 100 },
  { pattern: /\b(fantasy|epic fantasy|dark fantasy|high fantasy)\b/i, weight: 95 },
  { pattern: /\b(science fiction|sci-fi|space opera)\b/i, weight: 90 },
  { pattern: /\b(romance|contemporary romance)\b/i, weight: 85 },
  { pattern: /\b(mystery|thriller|crime|suspense|detective)\b/i, weight: 80 },
  { pattern: /\b(history|historical|historical fiction)\b/i, weight: 75 },
  { pattern: /\b(biography|autobiography|memoir)\b/i, weight: 70 },
  { pattern: /\b(spanish literature|literatura|hispanic)\b/i, weight: 65 },
  { pattern: /\b(classics|classic)\b/i, weight: 60 },
  { pattern: /\b(young adult|ya)\b/i, weight: 55 },
  { pattern: /\b(non-fiction|nonfiction)\b/i, weight: 50 },
  { pattern: /\b(philosophy|philosophical)\b/i, weight: 45 },
  { pattern: /\b(poetry|poesía)\b/i, weight: 40 },
  { pattern: /\b(horror)\b/i, weight: 35 },
  { pattern: /\b(business|economics)\b/i, weight: 30 },
];

export function cleanCategoryString(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(FICTION|NONFICTION)\s*\/\s*/i, "");
  s = s.replace(/\s*\/\s*/g, " / ");
  return s.trim();
}

export function isRubbishCategory(tag: string): boolean {
  const norm = tag.trim().toLowerCase();
  if (!norm || norm.length < 2 || norm.length > 80) return true;
  return RUBBISH_TAG_PATTERNS.some((pattern) => pattern.test(norm));
}

export function normalizeAndRankCategories(
  rawCategories: string[] | undefined | null,
  maxLimit: number = 5
): string[] {
  if (!rawCategories || rawCategories.length === 0) return [];

  const seen = new Set<string>();
  const candidates: Array<{ clean: string; score: number }> = [];

  for (const raw of rawCategories) {
    if (!raw || typeof raw !== "string") continue;
    const cleaned = cleanCategoryString(raw);
    if (isRubbishCategory(cleaned)) continue;

    const lowerKey = cleaned.toLowerCase();
    if (seen.has(lowerKey)) continue;
    seen.add(lowerKey);

    let score = 10;
    for (const pw of POPULAR_SUBJECT_WEIGHTS) {
      if (pw.pattern.test(cleaned)) {
        score += pw.weight;
        break;
      }
    }

    candidates.push({ clean: cleaned, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxLimit).map((c) => c.clean);
}

