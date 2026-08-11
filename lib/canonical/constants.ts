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

export function normalizeBookFormat(rawFormat?: string | null): BookFormat {
  if (!rawFormat) return "OTHER";
  const norm = rawFormat.toLowerCase().trim();

  if (
    norm.includes("hardcover") ||
    norm.includes("hardback") ||
    norm.includes("tapa dura") ||
    norm.includes("relie") ||
    norm.includes("relié") ||
    norm.includes("cartoné") ||
    norm.includes("cartone") ||
    norm.includes("library binding")
  ) {
    return "HARDCOVER";
  }
  if (norm.includes("mass market") || norm.includes("pocket") || norm.includes("bolsillo")) {
    return "MASS_MARKET";
  }
  if (
    norm.includes("paperback") ||
    norm.includes("softcover") ||
    norm.includes("tapa blanda") ||
    norm.includes("broché") ||
    norm.includes("broche") ||
    norm.includes("rustica") ||
    norm.includes("rústica") ||
    norm.includes("physical book") ||
    norm.includes("trade paper") ||
    norm.includes("perfect paperback")
  ) {
    return "PAPERBACK";
  }
  if (
    norm.includes("audio") ||
    norm.includes("mp3") ||
    norm.includes("cd") ||
    norm.includes("audible") ||
    norm.includes("cassette")
  ) {
    return "AUDIOBOOK";
  }
  if (
    norm.includes("ebook") ||
    norm.includes("kindle") ||
    norm.includes("digital") ||
    norm.includes("epub") ||
    norm.includes("pdf") ||
    norm.includes("nook")
  ) {
    return "EBOOK";
  }

  return "OTHER";
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract primary author and separate any concatenated non-author contributor names/roles.
 */
export function parseAuthorNames(rawAuthorName?: string | null): { primaryAuthor: string | null; extraContributors: Array<{ name: string; role: string }> } {
  if (!rawAuthorName || !rawAuthorName.trim()) {
    return { primaryAuthor: null, extraContributors: [] };
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
 */
export function normalizeLanguageCode(rawLang?: string | null): string {
  if (!rawLang) return "und";
  const norm = rawLang.toLowerCase().trim();

  const iso3ToIso1: Record<string, string> = {
    eng: "en",
    spa: "es",
    fra: "fr",
    fre: "fr",
    deu: "de",
    ger: "de",
    por: "pt",
    ita: "it",
    jpn: "ja",
    zho: "zh",
    chi: "zh",
    rus: "ru",
    nld: "nl",
    dut: "nl",
    pol: "pl",
    kor: "ko",
  };
  if (iso3ToIso1[norm]) return iso3ToIso1[norm];

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

  // Return original ISO code if 2-3 letters, else mark it undetermined.
  return norm.length <= 3 ? norm : "und";
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

export function normalizeLanguage(lang?: string | null): string | null {
  if (!lang || !lang.trim()) return null;
  const clean = lang.trim().toLowerCase();
  if (clean === "und" || clean === "undetermined" || clean === "unknown") return null;
  return lang.trim();
}
