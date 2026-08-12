/**
 * Canonical Constants & Normalizers for Books, Editions, Formats, and Languages.
 */

import {
  canonicalizeLanguage,
  languageFields,
  toIso639_1,
} from "@/lib/languages";

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
 * Public API format values. Always lowercase.
 * `other` is last-resort only — emit it when classification fails.
 */
export const API_BOOK_FORMATS = [
  "ebook",
  "hardcover",
  "paperback",
  "audiobook",
  "other",
] as const;

export type ApiBookFormat = (typeof API_BOOK_FORMATS)[number];

export const API_FORMAT_LABELS: Record<ApiBookFormat, string> = {
  ebook: "Ebook",
  hardcover: "Hardcover",
  paperback: "Paperback",
  audiobook: "Audiobook",
  other: "Other",
};

/**
 * Titles that are compilations, adaptations, or split volumes rather than the
 * primary novel. Used to filter or demote noisy search hits.
 */
export const COMPILATION_OR_DERIVATIVE_PATTERNS: RegExp[] = [
  /\bbundle\b/i,
  /\bbox(ed)?\s*set\b/i,
  /\bomnibus\b/i,
  /\bcollection\b/i,
  /\bcomplete\s+series\b/i,
  /\bcomplete\s+\d+\s*books?\b/i,
  /\bthe\s+story\s+continues\b/i,
  /\b\d+\s*[-–]\s*book\b/i,
  /\b\d+-book\b/i,
  /\ball\s+\d+\s+books?\b/i,
  /\b\d+\s+volumes?\b/i,
  /\bvolumes?\s+\d+[-–]\d+\b/i,
  /\bbooks?\s+\d+\s*[-–/]\s*\d+/i,
  /\bpreview\b/i,
  /\bprequel\b/i,
  /\brpg\b/i,
  /\bsupplement\b/i,
  /\bstoryboards?\b/i,
  /#\s*\d+\s*[-–]\s*#?\s*\d+/i,
  /\bgraphic\s+novel\b/i,
  /\bcomics?\b/i,
  /\bcómic\b/i,
  /\bpop-?up\b/i,
  /\bin\s+memoriam\b/i,
  /\bpart\s*[.#]?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
  /\bparte\s+(\d+|uno|dos|tres)\b/i,
  /\bvolume\s+\d+\b/i,
  /\bvol\.?\s*\d+\b/i,
  /\btomo\s+\d+\b/i,
  /\blibro\s+\d+\b/i,
  /#\s*\d+\s*$/i,
  /\bcompanion\b/i,
  /\bworld\s+of\b/i,
  /\bguide\s+to\b/i,
  /\bgu[ií]a\s+de\b/i,
  /\billustrated\b/i,
  /\badaptation\b/i,
  // Two distinct multi-word titles joined by "and" / "&" / "," — combo packs
  // like "Fourth Wing and Iron Flame". Skip "and the/a/an" so
  // "Harry Potter and the Philosopher's Stone" stays a novel.
  /\b[A-Z0-9][\w'’.-]+\s+[A-Z0-9][\w'’.-]+(?:\s+[A-Z0-9][\w'’.-]+)*\s+(?:and|&)\s+(?!the\b|a\b|an\b)[A-Z0-9][\w'’.-]+\s+[A-Z0-9][\w'’.-]+/i,
  /^[A-Z0-9][^,]{2,60},\s+(?!the\b|a\b|an\b)[A-Z0-9][^,]{2,60}$/i,
];

/** True when the title looks like a bundle, comic issue, split volume, etc. */
export function isCompilationOrDerivativeTitle(
  title?: string | null,
  workTitle?: string | null
): boolean {
  const combined = `${title || ""} ${workTitle || ""}`.trim();
  if (!combined) return false;
  return COMPILATION_OR_DERIVATIVE_PATTERNS.some((pattern) => pattern.test(combined));
}

/**
 * Standard ISO 639-1 Language Codes supported by the system.
 * Uses "und" (undetermined) when unspecified or unresolvable.
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

/** One normalization contract for persisted title keys and user queries. */
export function normalizeSearchText(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize and checksum-validate an ISBN-10 or ISBN-13. */
export function normalizeValidIsbn(raw?: string | null): string | null {
  if (!raw) return null;
  const isbn = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, char, index) => total + (char === "X" ? 10 : Number(char)) * (10 - index),
      0
    );
    return sum % 11 === 0 ? isbn : null;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn.slice(0, 12)].reduce(
      (total, char, index) => total + Number(char) * (index % 2 === 0 ? 1 : 3),
      0
    );
    return (10 - (sum % 10)) % 10 === Number(isbn[12]) ? isbn : null;
  }
  return null;
}

/**
 * Normalize provider format labels into the internal BookFormat enum.
 * Pass Hardcover `edition_format` as rawFormat and `reading_format.format`
 * as readingFormat — many ebooks only set the latter ("Ebook").
 */
export function normalizeBookFormat(
  rawFormat?: string | null,
  readingFormat?: string | null
): BookFormat {
  const edition = (rawFormat || "").toLowerCase().trim();
  const reading = (readingFormat || "").toLowerCase().trim();
  const norm = `${edition} ${reading}`.trim();
  if (!norm) return "OTHER";

  // Digital first — Kindle/ebook often has null edition_format + reading "Ebook".
  if (
    edition.includes("ebook") ||
    edition.includes("e-book") ||
    edition.includes("e book") ||
    edition.includes("kindle") ||
    edition.includes("digital") ||
    edition.includes("epub") ||
    edition.includes("pdf") ||
    edition.includes("nook") ||
    reading === "ebook" ||
    reading.includes("ebook") ||
    reading.includes("e-book")
  ) {
    return "EBOOK";
  }
  if (
    edition.includes("audio") ||
    edition.includes("audible") ||
    edition.includes("mp3") ||
    edition.includes("cassette") ||
    reading === "listened" ||
    reading.includes("audio")
  ) {
    return "AUDIOBOOK";
  }
  if (
    edition.includes("hardcover") ||
    edition.includes("hardback") ||
    edition.includes("tapa dura") ||
    edition.includes("relie") ||
    edition.includes("relié") ||
    edition.includes("cartoné") ||
    edition.includes("cartone") ||
    edition.includes("library binding") ||
    edition.includes("board book")
  ) {
    return "HARDCOVER";
  }
  if (edition.includes("mass market") || edition.includes("pocket") || edition.includes("bolsillo")) {
    return "MASS_MARKET";
  }
  if (
    edition.includes("paperback") ||
    edition.includes("softcover") ||
    edition.includes("tapa blanda") ||
    edition.includes("broché") ||
    edition.includes("broche") ||
    edition.includes("rustica") ||
    edition.includes("rústica") ||
    edition.includes("physical book") ||
    edition.includes("trade paper") ||
    edition.includes("perfect paperback")
  ) {
    return "PAPERBACK";
  }

  // Hardcover "Read" (edition or reading_format) means a physical/text edition
  // with no binding detail. Default unknown physical bindings to paperback.
  if (
    edition === "read" ||
    reading === "read" ||
    (edition.includes("read") && !edition.includes("spread")) ||
    reading.includes("read")
  ) {
    return "PAPERBACK";
  }

  return "OTHER";
}

/**
 * Map internal / raw format strings to the public lowercase vocabulary.
 * Known bindings become ebook | hardcover | paperback | audiobook.
 * `other` is last resort when nothing classifies.
 */
export function toApiBookFormat(
  rawFormat?: string | null,
  readingFormat?: string | null
): ApiBookFormat {
  const internal = normalizeBookFormat(rawFormat, readingFormat);
  switch (internal) {
    case "EBOOK":
      return "ebook";
    case "HARDCOVER":
      return "hardcover";
    case "AUDIOBOOK":
      return "audiobook";
    case "PAPERBACK":
    case "MASS_MARKET":
      return "paperback";
    case "OTHER":
    default:
      return "other";
  }
}

/** Display label for a public format. Raw source text is used only for `other`. */
export function toApiFormatLabel(
  rawFormat?: string | null,
  readingFormat?: string | null
): string {
  const api = toApiBookFormat(rawFormat, readingFormat);
  if (api !== "other") return API_FORMAT_LABELS[api];
  const raw = (rawFormat || readingFormat || "").trim();
  if (raw && !/^other$/i.test(raw)) return raw;
  return API_FORMAT_LABELS.other;
}

/**
 * Strip Goodreads/import catalog noise: librarian notes about alternate covers
 * for the same ISBN/ASIN. These often pollute descriptions from the 2017 dump.
 *
 * Examples:
 * - "An alternate cover edition can be found ..."
 * - "Librarian's note: An alternate cover for this ASIN can be found ..."
 * - "[An alternate cover edition for this ISBN can be found]"
 */
export function stripAlternateCoverNotes(text?: string | null): string {
  if (!text || !text.trim()) return text || "";

  const isNoiseLine = (line: string): boolean => {
    const t = line.trim().replace(/^[\[\(\s]+|[\]\)\s.]+$/g, "");
    if (!t) return false;
    const lower = t.toLowerCase();
    if (!lower.includes("alternate cover") && !lower.includes("alternative cover")) {
      return false;
    }
    // Librarian notes or standalone "an alternate cover ..." catalog lines.
    if (
      lower.startsWith("librarian") ||
      lower.startsWith("an alternate cover") ||
      lower.startsWith("a alternate cover") ||
      lower.startsWith("alternate cover") ||
      lower.startsWith("alternative cover")
    ) {
      return true;
    }
    // Short noise-only lines that still mention alternate covers.
    return lower.length < 160 && /alternate\s+covers?\b/.test(lower);
  };

  // Drop whole lines / paragraphs that are only catalog cover notes.
  let cleaned = text
    .split(/\n+/)
    .filter((line) => !isNoiseLine(line))
    .join("\n");

  // Strip inline notes that share a paragraph with real synopsis text.
  cleaned = cleaned
    .replace(
      /\(?\s*librarian'?s?\s*note:?\s*an?\s+alternate\s+cover[^)\n]*\)?/gi,
      ""
    )
    .replace(
      /(?:^|[.!?]\s+)an?\s+alternate\s+cover(?:\s+(?:edition|for|of|to)\b)[^.!?\n]*[.!?]?/gi,
      (match) => (match.startsWith(".") || match.startsWith("!") || match.startsWith("?") ? match[0] : "")
    )
    .replace(/\[\s*an?\s+alternate\s+cover[^\]]*\]/gi, "");

  return cleaned
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Check if a description or text snippet matches the target language.
 */
export function isTextInLanguage(text: string | null | undefined, targetLang: string): boolean {
  if (!text || !text.trim()) return false;
  const lower = text.toLowerCase();
  const iso = normalizeLanguageCode(targetLang);

  if (iso === "es") {
    const spanishIndicators = [
      " el ", " la ", " los ", " las ", " un ", " una ", " unos ", " unas ",
      " y ", " en ", " de ", " que ", " con ", " por ", " para ", " es ",
      " su ", " sus ", " como ", " pero ", " sobre ", " este ", " esta ",
      " libro ", " historia ", " vida ", " cuatro ", " mundo ", " armario ",
      " bruja ", " leon ", " león ", " aventura "
    ];
    const matchCount = spanishIndicators.filter((w) => lower.includes(w)).length;
    const englishIndicators = [
      " the ", " and ", " of ", " to ", " in ", " a ", " is ", " that ",
      " with ", " for ", " as ", " was ", " from ", " four ", " siblings ",
      " wardrobe ", " step "
    ];
    const englishCount = englishIndicators.filter((w) => lower.includes(w)).length;

    return matchCount > englishCount;
  }

  if (iso === "en") {
    const englishIndicators = [" the ", " and ", " of ", " to ", " in ", " a ", " is ", " that ", " with ", " for ", " as ", " was ", " from "];
    return englishIndicators.filter((w) => lower.includes(w)).length >= 2;
  }

  return true;
}

/**
 * Format total audio seconds into human-readable duration (e.g. 40440s -> "11h 14m") and total minutes.
 */
export function formatAudioLength(totalSeconds?: number | null): { audioLength: string | null; audioLengthMinutes: number | null } {
  if (typeof totalSeconds !== "number" || totalSeconds <= 0) {
    return { audioLength: null, audioLengthMinutes: null };
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let label = "";
  if (hours > 0 && minutes > 0) {
    label = `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    label = `${hours}h`;
  } else {
    label = `${minutes}m`;
  }

  return {
    audioLength: label,
    audioLengthMinutes: totalMinutes,
  };
}

export function calculatePopularityScore(
  ratingsCount?: number | null,
  averageRating?: number | null,
  reviewsCount?: number | null
): number | null {
  if (!ratingsCount || ratingsCount <= 0 || !averageRating || averageRating <= 0) {
    return null;
  }
  const rCount = Math.max(0, ratingsCount);
  const avg = Math.max(0, averageRating);
  const revCount = Math.max(0, reviewsCount || 0);

  const score = Math.log10(rCount + 1) * avg * Math.log10(revCount + 1);
  return Number.isFinite(score) && score > 0 ? score : null;
}

/**
 * Normalize author name into a canonical slug for deduplication (e.g. "C. S. Lewis" & "C.S. Lewis" -> "c-s-lewis").
 */
export function normalizeAuthorSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(translator|translation|translated by|illustrator|illustration|illustrated by|narrator|narrated by|reader|read by|reading|editor|edited by|cover artist)\b/gi, "")
    .replace(/[\(\)\[\]]/g, " ")
    .replace(/(?<=\b[a-z])[\s\.\-]+(?=[a-z]\b)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}

export function htmlToMarkdown(input: string | null | undefined): string {
  if (!input || !input.trim()) return "";
  let text = input.trim();
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    return stripAlternateCoverNotes(decodeHtmlEntities(text));
  }

  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, content) => `\n\n### ${content.trim()}\n\n`);
  text = text.replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**");
  text = text.replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*");
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?[^>]+(>|$)/g, "");
  text = decodeHtmlEntities(text);
  return stripAlternateCoverNotes(
    text
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export const IGNORED_AUTHOR_IDS = new Set<string>([
  "c5b735e7-f062-4375-a9cf-c94d08dc3f17", // j.k. rwlynj
  "ca677058-732b-428f-a955-9b7c60c941fc", // wyd slmyh
]);

export const IGNORED_AUTHOR_SLUGS = new Set<string>([
  "j-k-rwlynj",
  "wyd-slmyh",
]);

export function isIgnoredAuthor(
  id?: string | null,
  name?: string | null,
  slug?: string | null
): boolean {
  if (id && IGNORED_AUTHOR_IDS.has(id)) return true;
  if (slug && IGNORED_AUTHOR_SLUGS.has(slug)) return true;
  if (name) {
    const norm = normalizeAuthorSlug(name);
    if (norm && IGNORED_AUTHOR_SLUGS.has(norm)) return true;
  }
  return false;
}


/**
 * Extract primary author and separate any concatenated non-author contributor names/roles.
 */
export function parseAuthorNames(rawAuthorName?: string | null): { primaryAuthor: string | null; extraContributors: Array<{ name: string; role: string }> } {
  if (!rawAuthorName || !rawAuthorName.trim()) {
    return { primaryAuthor: null, extraContributors: [] };
  }

  // Heuristic: "Lastname, Firstname" single-author format (common in ISBNDB).
  // If the raw string has exactly one comma and no other multi-author delimiters
  // (&, ;, "and", "y"), reassemble it as "Firstname Lastname" so the comma
  // is not mistaken for an author separator.
  const hasMultiAuthorDelimiter = /[;&]|\band\b|\by\b/i.test(rawAuthorName);
  const commaCount = (rawAuthorName.match(/,/g) || []).length;
  if (!hasMultiAuthorDelimiter && commaCount === 1) {
    const [last, first] = rawAuthorName.split(",").map((p) => p.trim());
    if (last && first) {
      rawAuthorName = `${first} ${last}`;
    }
  }

  const parts = rawAuthorName.split(/[,;&]|\band\b|\by\b/i).map((p) => p.trim()).filter(Boolean);
  
  let primaryAuthor: string | null = null;
  const extraContributors: Array<{ name: string; role: string }> = [];

  for (const part of parts) {
    const roleMatch = part.match(/\((translator|translation|illustrator|illustration|narrator|reader|reading|editor)\)/i);
    const cleanName = part.replace(/\(.*?\)/g, "").trim();
    if (!cleanName) continue;

    if (roleMatch) {
      const roleStr = roleMatch[1].toLowerCase();
      let role = "AUTHOR";
      if (roleStr.includes("trans")) role = "TRANSLATOR";
      else if (roleStr.includes("illus")) role = "ILLUSTRATOR";
      else if (roleStr.includes("narrat") || roleStr.includes("read")) role = "NARRATOR";
      else if (roleStr.includes("edit")) role = "EDITOR";
      extraContributors.push({ name: cleanName, role });
    } else {
      if (!primaryAuthor) {
        primaryAuthor = cleanName;
      } else {
        extraContributors.push({ name: cleanName, role: "AUTHOR" });
      }
    }
  }

  return { primaryAuthor, extraContributors };
}

/**
 * Normalize language strings/codes into ISO 639-1 standard code (e.g., "Spanish" -> "es").
 * Empty/unknown long strings become "und". Unrecognized 2–3 letter codes pass through.
 */
export function normalizeLanguageCode(rawLang?: string | null): string {
  if (!rawLang?.trim()) return "und";
  const code = toIso639_1(rawLang);
  if (code) return code;

  const norm = rawLang.toLowerCase().trim().split(/[-_]/)[0];
  // Preserve short unknown codes for import/debug (e.g. rare ISO tags).
  if (/^[a-z]{2,3}$/.test(norm)) return norm;
  return "und";
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

/**
 * Priority rank for cover images:
 * Rank 1: Hardcover (highest priority)
 * Rank 2: Other external services (ISBNDB, OpenLibrary, Amazon, etc.)
 * Rank 3: Goodreads (last resort)
 */
export function getCoverPriorityRank(urlOrProvider?: string | null): number {
  if (!urlOrProvider || !urlOrProvider.trim()) return 999;
  const str = urlOrProvider.toLowerCase();

  // Rank 1: Hardcover
  if (str.includes("hardcover") || str.includes("assets.hardcover.app")) {
    return 1;
  }

  // Rank 3: Goodreads (last resort)
  if (
    str.includes("goodreads") ||
    str.includes("gr-assets.com") ||
    str.includes("images.gr-assets")
  ) {
    return 3;
  }

  // Rank 2: Other services (ISBNDB, OpenLibrary, etc.)
  return 2;
}

/** True when a cover URL comes from Goodreads' low-resolution image CDN. */
export function isGoodreadsCoverUrl(url?: string | null): boolean {
  return Boolean(url?.trim()) && getCoverPriorityRank(url) === 3;
}

export function pickBestCoverUrl(
  candidates: Array<string | null | undefined>
): string {
  const valid = candidates.filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );
  if (valid.length === 0) return "";

  valid.sort((a, b) => getCoverPriorityRank(a) - getCoverPriorityRank(b));
  return valid[0];
}

export function selectBestCover<T extends { url?: string | null; provider?: string | null }>(
  covers: T[] | null | undefined
): T | undefined {
  if (!covers || covers.length === 0) return undefined;
  const validCovers = covers.filter((c) => c && c.url && c.url.trim().length > 0);
  if (validCovers.length === 0) return undefined;

  const sorted = [...validCovers].sort((a, b) => {
    const rankA = Math.min(getCoverPriorityRank(a.provider), getCoverPriorityRank(a.url));
    const rankB = Math.min(getCoverPriorityRank(b.provider), getCoverPriorityRank(b.url));
    return rankA - rankB;
  });

  return sorted[0];
}

export function roundRating(rating?: number | null): number | null {
  if (typeof rating !== "number" || isNaN(rating) || rating <= 0) return null;
  return Math.round(rating * 100) / 100;
}

/**
 * English display name for a language string from any provider/DB source.
 * Prefer {@link languageFields} when setting both `language` and `languageCode`.
 */
export function normalizeLanguage(lang?: string | null): string | null {
  return languageFields(lang).language;
}

export { languageFields, canonicalizeLanguage, toIso639_1 };
