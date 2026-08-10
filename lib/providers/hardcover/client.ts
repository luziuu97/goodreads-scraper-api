import { API_CONFIG, getHardcoverApiToken } from "@/lib/api-config";
import { formatAudioLength } from "@/lib/canonical/constants";
import { toIso639_1 } from "@/lib/languages";
import { hardcoverLimiter } from "@/lib/outgoing-rate-limiter";

const HARDCOVER_GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";

type HardcoverImage = {
  id?: number | string | null;
  url?: string | null;
  width?: number | null;
  height?: number | null;
  ratio?: number | null;
  color?: string | null;
} | null;

type HardcoverSearchResult = {
  id?: number | string;
  slug?: string;
  title?: string;
  alternative_titles?: string[] | null;
  author_names?: string[];
  rating?: number;
  ratings_count?: number;
  users_count?: number;
  users_read_count?: number;
  release_date?: string;
  genres?: string[];
  image?: HardcoverImage;
};

type HardcoverSearchHit = {
  document?: HardcoverSearchResult | null;
  /** Typesense text relevance score when present. */
  text_match?: number;
};

type HardcoverSearchResults = {
  found?: number | null;
  hits?: HardcoverSearchHit[] | null;
};

type HardcoverLanguage = {
  language?: string | null;
  code2?: string | null;
  code3?: string | null;
} | null;

type HardcoverCountry = {
  name?: string | null;
  code2?: string | null;
  code3?: string | null;
} | null;

type HardcoverContribution = {
  contribution?: string | null;
  author?: {
    id?: number | null;
    name?: string | null;
    slug?: string | null;
  } | null;
};

type HardcoverEditionSearchResult = {
  id?: number;
  isbn_10?: string | null;
  isbn_13?: string | null;
  asin?: string | null;
  title?: string | null;
  release_date?: string | null;
  rating?: number | null;
  edition_format?: string | null;
  pages?: number | null;
  image?: HardcoverImage;
  language?: HardcoverLanguage;
  country?: HardcoverCountry;
  publisher?: {
    name?: string | null;
  } | null;
  contributions?: HardcoverContribution[] | null;
  book?: {
    id?: number | null;
    slug?: string | null;
    title?: string | null;
    rating?: number | null;
    release_date?: string | null;
    cached_tags?: Record<string, Array<{ tag?: string | null }>> | null;
    contributions?: HardcoverContribution[] | null;
  } | null;
};

type HardcoverDetailsBook = {
  id: number;
  slug: string;
  title: string;
  subtitle?: string | null;
  headline?: string | null;
  description?: string | null;
  rating?: number | null;
  ratings_count?: number | null;
  reviews_count?: number | null;
  release_date?: string | null;
  cached_tags?: Record<string, Array<{ tag?: string | null }>> | null;
  featured_book_series?: {
    position?: number | null;
    details?: string | null;
    series?: {
      name?: string | null;
      slug?: string | null;
    } | null;
  } | null;
  book_series?: Array<{
    position?: number | null;
    details?: string | null;
    featured?: boolean | null;
    series?: {
      name?: string | null;
      slug?: string | null;
    } | null;
  }> | null;
  contributions?: HardcoverContribution[] | null;
  image?: Array<{
    url?: string | null;
  }> | null;
  default_cover_edition?: HardcoverEditionDetails | null;
};

type HardcoverEditionDetails = {
  id?: number | null;
  title?: string | null;
  release_date?: string | null;
  rating?: number | null;
  image?: HardcoverImage;
  pages?: number | null;
  edition_format?: string | null;
  isbn_10?: string | null;
  isbn_13?: string | null;
  asin?: string | null;
  language?: HardcoverLanguage;
  country?: HardcoverCountry;
  publisher?: {
    name?: string | null;
  } | null;
  contributions?: HardcoverContribution[] | null;
  book?: {
    id?: number | null;
    slug?: string | null;
  } | null;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export type HardcoverNormalizedSearchBook = {
  id: string;
  title: string;
  /** Canonical work title when presentation title comes from an edition. */
  workTitle?: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string;
  genres?: string[];
  language?: string | null;
  languageCode?: string | null;
  translators?: string[];
  presentation?: "work" | "edition" | "isbn";
  edition?: HardcoverNormalizedEdition;
};

export type HardcoverContributor = {
  id: number;
  name: string;
  url: string;
  /** Raw contribution role from Hardcover when known (e.g. Translator). */
  role?: string | null;
};

export type HardcoverNormalizedEdition = {
  id: number;
  title?: string;
  isbn: string | null;
  isbn10: string | null;
  asin: string | null;
  format: string | null;
  publicationDate: string | null;
  pages: number | null;
  audioLength?: string | null;
  audioLengthMinutes?: number | null;
  publisher: string | null;
  language: string | null;
  languageCode: string | null;
  country: string | null;
  countryCode: string | null;
  cover: string;
};

export type HardcoverNormalizedBookDetails = {
  scrapedURL: string;
  book: {
    cover: string;
    series: string;
    seriesURL: string;
    pages: number | null;
    audioLength?: string | null;
    audioLengthMinutes?: number | null;
    slug: string;
    title: string;
    author: HardcoverContributor[];
    /** First translator when present (legacy singular field). */
    translator: HardcoverContributor | null;
    translators: HardcoverContributor[];
    illustrators: HardcoverContributor[];
    narrators: HardcoverContributor[];
    editors: HardcoverContributor[];
    /** Other non-author contributors with their raw role when known. */
    otherContributors: HardcoverContributor[];
    rating: string;
    ratingCount: string;
    reviewsCount: string;
    description: string;
    genres: string[];
    bookEdition: string | null;
    publishDate: string | null;
    isbn: string | null;
    isbn10: string | null;
    asin: string | null;
    language: string | null;
    languageCode: string | null;
    country: string | null;
    countryCode: string | null;
    publishedBy: string | null;
    type: string | null;
    edition: HardcoverNormalizedEdition | null;
    related: unknown[];
    reviewBreakdown: {
      rating5: string;
      rating4: string;
      rating3: string;
      rating2: string;
      rating1: string;
    };
    quotes: string;
    quotesURL: string;
    questions: string;
    questionsURL: string;
    lastScraped: string;
  };
};

function normalizeAuthorizationToken(rawToken: string): string {
  return /^bearer\s+/i.test(rawToken) ? rawToken : `Bearer ${rawToken}`;
}

async function hardcoverGraphQLRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const token = getHardcoverApiToken();
  if (!token) {
    console.error("[Hardcover GraphQL] Missing HARDCOVER_API_TOKEN in environment variables");
    throw new Error("HARDCOVER_API_TOKEN is required to use provider=hardcover");
  }

  await hardcoverLimiter.acquire();

  let response: Response;
  try {
    response = await fetch(HARDCOVER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": API_CONFIG.userAgent,
        authorization: normalizeAuthorizationToken(token),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (netErr) {
    console.error(`[Hardcover GraphQL] Network/fetch request failed:`, netErr);
    throw netErr;
  }

  if (response.status === 429) {
    const targetQuery = String(variables.query || variables.slug || variables.isbn || "request");
    console.warn(`[Hardcover GraphQL] Rate limited (HTTP 429) for query: "${targetQuery}"`);
    throw new Error(`Hardcover request failed with status 429`);
  }

  let json: GraphQLResponse<T>;
  try {
    json = (await response.json()) as GraphQLResponse<T>;
  } catch (parseErr) {
    console.error(
      `[Hardcover GraphQL] Invalid JSON response from Hardcover (HTTP ${response.status}):`,
      parseErr
    );
    throw new Error(`Hardcover returned unparseable response with status ${response.status}`);
  }

  if (!response.ok) {
    const message =
      json.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      `Hardcover request failed with status ${response.status}`;
    console.error(`[Hardcover GraphQL] HTTP ${response.status} Error: ${message}`, {
      variables,
      errors: json.errors,
    });
    throw new Error(message);
  }

  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    console.error(`[Hardcover GraphQL] Query Errors: ${message}`, {
      variables,
      errors: json.errors,
    });
    throw new Error(message || "Hardcover GraphQL request failed");
  }

  if (!json.data) {
    console.error(`[Hardcover GraphQL] Missing data field in response`, { variables });
    throw new Error("Hardcover GraphQL response did not include data");
  }

  return json.data;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function trimToNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatBookDescription(
  headline: string | null | undefined,
  description: string | null | undefined
): string {
  const normalizedHeadline = trimToNull(headline);
  const normalizedDescription = trimToNull(description);

  return [
    normalizedHeadline ? `**${normalizedHeadline}**` : null,
    normalizedDescription,
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
}

function toCoverUrl(image: HardcoverImage | HardcoverDetailsBook["image"]): string {
  if (!image) return "";
  if (Array.isArray(image)) {
    return image.find((entry) => typeof entry?.url === "string" && entry.url)?.url || "";
  }
  return typeof image.url === "string" ? image.url : "";
}

type ContributionRole =
  | "author"
  | "translator"
  | "illustrator"
  | "narrator"
  | "editor"
  | "other";

type GroupedContributors = {
  authors: HardcoverContributor[];
  translators: HardcoverContributor[];
  illustrators: HardcoverContributor[];
  narrators: HardcoverContributor[];
  editors: HardcoverContributor[];
  other: HardcoverContributor[];
};

/**
 * Classify a free-text Hardcover contribution role.
 * null / empty / Author-like → author (Hardcover convention).
 */
function classifyContributionRole(role: string | null | undefined): ContributionRole {
  const raw = (role ?? "").trim();
  if (!raw) {
    return "author";
  }

  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // Order matters: check more specific multi-word roles before generic substrings.
  if (
    /\b(translator|translation|translated by|traduct(?:eur|ora?|ion)|traduttore|übersetzer|vertaler|번역|訳者|译者)\b/.test(
      normalized
    ) ||
    normalized === "tr." ||
    normalized === "trans."
  ) {
    return "translator";
  }

  if (
    /\b(illustrator|illustration|illustrated by|illustrations by|cover artist|artist|drawer|colorist|inker|letterer|penciller|penciler|cartoonist|mangaka)\b/.test(
      normalized
    ) ||
    normalized === "ill." ||
    normalized === "ills."
  ) {
    return "illustrator";
  }

  if (
    /\b(narrator|narrated by|reading|reader|read by|performed by|voice actor|voiceover)\b/.test(
      normalized
    )
  ) {
    return "narrator";
  }

  if (
    /\b(editor|edited by|compilation editor|series editor|abridger|abridged by)\b/.test(
      normalized
    )
  ) {
    return "editor";
  }

  if (
    normalized === "author" ||
    normalized === "writer" ||
    normalized === "auteur" ||
    normalized === "autor" ||
    normalized === "autora" ||
    normalized === "著者" ||
    normalized === "저자" ||
    normalized === "primary contributor" ||
    normalized === "co-author" ||
    normalized === "coauthor" ||
    normalized === "co author" ||
    normalized === "ghostwriter" ||
    normalized === "ghost writer"
  ) {
    return "author";
  }

  // Unknown free-text roles (messy catalog data) stay out of the author list.
  return "other";
}

function mapContributor(
  contribution: HardcoverContribution,
  index: number
): HardcoverContributor | null {
  const author = contribution.author;
  const name = author?.name?.trim() || "";
  if (!name) {
    return null;
  }

  return {
    id: typeof author?.id === "number" ? author.id : index + 1,
    name,
    url: author?.slug ? `https://hardcover.app/authors/${author.slug}` : "",
    role: trimToNull(contribution.contribution),
  };
}

function groupContributions(
  contributions: HardcoverContribution[] | null | undefined
): GroupedContributors {
  const grouped: GroupedContributors = {
    authors: [],
    translators: [],
    illustrators: [],
    narrators: [],
    editors: [],
    other: [],
  };

  const seen = new Set<string>();

  (contributions || []).forEach((contribution, index) => {
    const person = mapContributor(contribution, index);
    if (!person) {
      return;
    }

    const role = classifyContributionRole(contribution.contribution);
    const dedupeKey = `${role}:${person.id}:${person.name.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    switch (role) {
      case "author":
        grouped.authors.push(person);
        break;
      case "translator":
        grouped.translators.push(person);
        break;
      case "illustrator":
        grouped.illustrators.push(person);
        break;
      case "narrator":
        grouped.narrators.push(person);
        break;
      case "editor":
        grouped.editors.push(person);
        break;
      default:
        grouped.other.push(person);
        break;
    }
  });

  return grouped;
}

/**
 * Prefer edition-level contributions when present (edition-specific translators etc.),
 * otherwise fall back to book-level contributions.
 */
function resolveContributors(
  bookContributions: HardcoverContribution[] | null | undefined,
  editionContributions: HardcoverContribution[] | null | undefined
): GroupedContributors {
  const editionGrouped = groupContributions(editionContributions);
  const editionHasPeople =
    editionGrouped.authors.length +
      editionGrouped.translators.length +
      editionGrouped.illustrators.length +
      editionGrouped.narrators.length +
      editionGrouped.editors.length +
      editionGrouped.other.length >
    0;

  if (editionHasPeople) {
    return editionGrouped;
  }

  return groupContributions(bookContributions);
}

function authorNamesFromContributions(
  contributions: HardcoverContribution[] | null | undefined
): string {
  return groupContributions(contributions)
    .authors.map((author) => author.name)
    .filter(Boolean)
    .join(", ");
}

function getSeriesLabel(book: HardcoverDetailsBook): string {
  const featuredName = book.featured_book_series?.series?.name?.trim();
  if (featuredName) {
    const position =
      book.featured_book_series?.details?.trim() ||
      (typeof book.featured_book_series?.position === "number"
        ? String(book.featured_book_series.position)
        : "");
    return position ? `${featuredName} #${position}` : featuredName;
  }

  const firstSeries = book.book_series?.find((entry) => entry.series?.name?.trim());
  const seriesName = firstSeries?.series?.name?.trim() || "";
  if (!seriesName) {
    return "";
  }

  const position =
    firstSeries?.details?.trim() ||
    (typeof firstSeries?.position === "number" ? String(firstSeries.position) : "");
  return position ? `${seriesName} #${position}` : seriesName;
}

function getSeriesUrl(book: HardcoverDetailsBook): string {
  const featuredSlug = book.featured_book_series?.series?.slug?.trim();
  if (featuredSlug) {
    return `https://hardcover.app/series/${featuredSlug}`;
  }

  const firstSlug = book.book_series?.find((entry) => entry.series?.slug?.trim())?.series?.slug?.trim();
  return firstSlug ? `https://hardcover.app/series/${firstSlug}` : "";
}

function getEditionGenres(
  cachedTags: HardcoverEditionSearchResult["book"] extends infer T
    ? T extends { cached_tags?: infer C }
      ? C
      : never
    : never
): string[] | undefined {
  const genreEntries = cachedTags?.Genre;
  if (!Array.isArray(genreEntries)) {
    return undefined;
  }

  const genres = genreEntries
    .map((entry) => (typeof entry?.tag === "string" ? entry.tag.trim() : ""))
    .filter(Boolean);

  return genres.length > 0 ? genres : undefined;
}

function languageFromEdition(
  language: HardcoverLanguage | undefined
): { language: string | null; languageCode: string | null } {
  return {
    language: trimToNull(language?.language),
    languageCode: trimToNull(language?.code2)?.toLowerCase() ?? null,
  };
}

function countryFromEdition(
  country: HardcoverCountry | undefined
): { country: string | null; countryCode: string | null } {
  return {
    country: trimToNull(country?.name),
    countryCode: trimToNull(country?.code2)?.toLowerCase() ?? null,
  };
}

function normalizeEdition(
  edition: HardcoverEditionSearchResult | HardcoverEditionDetails | null | undefined
): HardcoverNormalizedEdition | undefined {
  if (typeof edition?.id !== "number") {
    return undefined;
  }

  const { language, languageCode } = languageFromEdition(edition.language);
  const { country, countryCode } = countryFromEdition(edition.country);

  const audioInfo = formatAudioLength(
    typeof (edition as any).audio_seconds === "number" ? (edition as any).audio_seconds : null
  );

  return {
    id: edition.id,
    title: trimToNull(edition.title) || undefined,
    isbn: trimToNull(edition.isbn_13),
    isbn10: trimToNull(edition.isbn_10),
    asin: trimToNull(edition.asin),
    format: trimToNull(edition.edition_format),
    publicationDate: trimToNull(edition.release_date),
    pages: typeof edition.pages === "number" ? edition.pages : null,
    audioLength: audioInfo.audioLength,
    audioLengthMinutes: audioInfo.audioLengthMinutes,
    publisher: trimToNull(edition.publisher?.name),
    language,
    languageCode,
    country,
    countryCode,
    cover: toCoverUrl(edition.image || null),
  };
}

function imageSelection(): string {
  return `
    id
    url
    width
    height
    ratio
    color
  `;
}

function contributionSelection(): string {
  return `
    contribution
    author {
      id
      name
      slug
    }
  `;
}

function editionSelection(
  includeBook = false,
  includeImageMeta = false,
  includeContributions = false
): string {
  const imageFields = includeImageMeta
    ? imageSelection()
    : `
      url
    `;

  return `
    id
    title
    release_date
    rating
    pages
    edition_format
    audio_seconds
    isbn_10
    isbn_13
    asin
    image {
      ${imageFields}
    }
    language {
      language
      code2
    }
    country {
      name
      code2
      code3
    }
    publisher {
      name
    }
    ${includeContributions ? `
    contributions {
      ${contributionSelection()}
    }
    ` : ""}
    ${includeBook ? `
    book {
      id
      slug
    }
    ` : ""}
  `;
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeImageMeta(image: HardcoverImage): {
  url: string;
  imageId: number | null;
  width: number | null;
  height: number | null;
  ratio: number | null;
  color: string | null;
  pixelCount: number | null;
} {
  const url = toCoverUrl(image);
  const width = toPositiveInt(image?.width);
  const height = toPositiveInt(image?.height);
  const pixelCount =
    width !== null && height !== null ? width * height : null;

  // Hardcover sometimes stores ratio as 0; derive from dimensions when possible.
  const rawRatio = toFiniteNumber(image?.ratio);
  const ratio =
    rawRatio !== null && rawRatio > 0
      ? rawRatio
      : width !== null && height !== null && height > 0
        ? width / height
        : null;

  return {
    url,
    imageId: toPositiveInt(image?.id),
    width,
    height,
    ratio,
    color: trimToNull(typeof image?.color === "string" ? image.color : null),
    pixelCount,
  };
}

function normalizeIsbnQuery(query: string): string {
  return query.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function isLikelyIsbnQuery(query: string): boolean {
  const normalized = normalizeIsbnQuery(query);
  return /^(?:\d{9}[\dX]|\d{13})$/.test(normalized);
}

/** Normalize titles for cross-language matching (accents/punctuation/case). */
function normalizeTitleForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’ʻʻ`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similarity in [0, 1] between two titles.
 * Exact / containment preferred; falls back to token Jaccard.
 */
function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitleForMatch(a);
  const nb = normalizeTitleForMatch(b);
  if (!na || !nb) {
    return 0;
  }
  if (na === nb) {
    return 1;
  }

  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length >= 4) {
    return 0.72 + 0.23 * (shorter.length / longer.length);
  }

  const tokensA = new Set(na.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Best title similarity of a query against the work title and known alternatives
 * (covers translated titles like "El Señor de los Anillos" → "The Lord of the Rings").
 */
function bestTitleSimilarity(
  query: string,
  title: string,
  alternativeTitles: string[] | null | undefined
): number {
  let best = titleSimilarity(query, title);
  if (!Array.isArray(alternativeTitles)) {
    return best;
  }
  for (const alt of alternativeTitles) {
    if (typeof alt === "string" && alt.trim()) {
      best = Math.max(best, titleSimilarity(query, alt));
    }
  }
  return best;
}

type RankableSearchBook = {
  book: HardcoverNormalizedSearchBook;
  textMatch: number;
  usersCount: number;
  ratingsCount: number;
  usersReadCount: number;
  titleSim: number;
  originalIndex: number;
};

/**
 * Composite quality score for search hits.
 *
 * Typesense often ranks empty catalog shells with an exact translated title
 * above well-known works that only match via alternative_titles. We re-rank
 * by text relevance + title similarity + reader popularity + metadata completeness
 * so "El Señor de los Anillos" surfaces Tolkien rather than a blank entry.
 */
function scoreSearchHit(hit: RankableSearchBook, maxTextMatch: number): number {
  const textRel = maxTextMatch > 0 ? hit.textMatch / maxTextMatch : 1;
  const users = hit.usersCount;
  const ratingsCount = hit.ratingsCount;
  const usersRead = hit.usersReadCount;

  // Log scale so mega-hits outrank shells without totally drowning niche matches.
  const popularity =
    Math.log10(users + 1) * 18 +
    Math.log10(ratingsCount + 1) * 10 +
    Math.log10(usersRead + 1) * 4;

  const hasAuthor = Boolean(hit.book.author?.trim());
  const hasCover = Boolean(hit.book.cover);
  const hasRating =
    typeof hit.book.rating === "number" &&
    Number.isFinite(hit.book.rating) &&
    hit.book.rating > 0;

  let completeness = 0;
  if (hasAuthor) completeness += 22;
  if (hasCover) completeness += 12;
  if (hasRating) completeness += 12;
  // Empty shells (title only, no readers) should sink hard.
  if (!hasAuthor && users === 0) completeness -= 50;

  // Tiny stable bias toward Typesense order when scores otherwise tie.
  const orderBias = Math.max(0, 3 - hit.originalIndex * 0.05);

  return textRel * 40 + hit.titleSim * 35 + popularity + completeness + orderBias;
}

function rankSearchBooks(
  hits: RankableSearchBook[],
  limit: number
): HardcoverNormalizedSearchBook[] {
  if (hits.length === 0) {
    return [];
  }

  const maxTextMatch = Math.max(...hits.map((hit) => hit.textMatch), 1);
  return [...hits]
    .sort((a, b) => {
      const scoreDiff = scoreSearchHit(b, maxTextMatch) - scoreSearchHit(a, maxTextMatch);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return a.originalIndex - b.originalIndex;
    })
    .slice(0, limit)
    .map((hit) => hit.book);
}

type EnrichmentEdition = {
  id?: number | null;
  title?: string | null;
  isbn_10?: string | null;
  isbn_13?: string | null;
  asin?: string | null;
  pages?: number | null;
  edition_format?: string | null;
  release_date?: string | null;
  users_count?: number | null;
  image?: HardcoverImage;
  language?: HardcoverLanguage;
  country?: HardcoverCountry;
  publisher?: { name?: string | null } | null;
  contributions?: HardcoverContribution[] | null;
};

type EnrichmentBook = {
  id: number;
  title?: string | null;
  editions?: EnrichmentEdition[] | null;
};

/**
 * Pick the best edition for a search hit based on query title match and
 * optional language preference. Returns null when work-level presentation is better.
 */
function pickPresentationEdition(
  query: string,
  workTitle: string,
  editions: EnrichmentEdition[],
  languagePref: string | null
): { edition: EnrichmentEdition; score: number } | null {
  if (editions.length === 0) {
    return null;
  }

  const workScore = titleSimilarity(query, workTitle);

  // When the caller asks for a language, only score editions in that language.
  // (Otherwise English "A Game of Thrones" editions always beat Spanish packaging
  // on title similarity alone.)
  const candidates = languagePref
    ? editions.filter((edition) => {
        const code = trimToNull(edition.language?.code2)?.toLowerCase();
        return code === languagePref;
      })
    : editions;

  if (candidates.length === 0) {
    return null;
  }

  let best: { edition: EnrichmentEdition; score: number } | null = null;

  for (const edition of candidates) {
    if (typeof edition.id !== "number") {
      continue;
    }

    const editionTitle = trimToNull(edition.title) || "";
    const titleScore = editionTitle
      ? titleSimilarity(query, editionTitle)
      : 0;
    const users =
      typeof edition.users_count === "number" && Number.isFinite(edition.users_count)
        ? edition.users_count
        : 0;
    const hasCover = Boolean(toCoverUrl(edition.image || null));
    const hasTranslator =
      groupContributions(edition.contributions).translators.length > 0;
    const localizedTitle =
      Boolean(editionTitle) && titleSimilarity(editionTitle, workTitle) < 0.85;

    let score: number;

    if (languagePref) {
      // Query may be in the original language (e.g. "A Game of Thrones" + language=es).
      // Prefer popular localized editions over bilingual/title-similar outliers.
      score =
        Math.min(users, 2000) / 10 +
        (localizedTitle ? 25 : 0) +
        (hasCover ? 8 : 0) +
        (hasTranslator ? 12 : 0) +
        titleScore * 15;
    } else {
      score = titleScore * 100;
      if (workScore >= 0.85 && titleScore + 0.05 < workScore) {
        // Don't replace a strong work-title match with a weak edition title.
        score -= 25;
      }
      score += Math.min(users, 500) / 500;
      if (editionTitle || hasCover) {
        score += 1;
      }
      if (hasTranslator) {
        score += 2;
      }
    }

    if (!best || score > best.score) {
      best = { edition, score };
    }
  }

  if (!best) {
    return null;
  }

  // Explicit language preference: always present the best locale edition.
  if (languagePref) {
    return best;
  }

  const bestTitle = trimToNull(best.edition.title) || "";
  const bestTitleScore = bestTitle ? titleSimilarity(query, bestTitle) : 0;

  // Promote edition presentation when:
  // 1) edition title matches the query better than the work title, or
  // 2) query looks like a translation (weak work match, strong edition match).
  const betterThanWork = bestTitleScore >= workScore + 0.08 && bestTitleScore >= 0.55;
  const translationQuery =
    workScore < 0.7 && bestTitleScore >= 0.55;

  if (betterThanWork || translationQuery) {
    return best;
  }

  return null;
}

async function enrichSearchHitsWithEditions(
  books: HardcoverNormalizedSearchBook[],
  query: string,
  languagePref: string | null
): Promise<HardcoverNormalizedSearchBook[]> {
  const numericIds = books
    .map((book) => (/^\d+$/.test(book.id) ? Number(book.id) : null))
    .filter((id): id is number => id !== null);

  if (numericIds.length === 0) {
    return books.map((book) => ({
      ...book,
      workTitle: book.workTitle || book.title,
      presentation: book.presentation || "work",
    }));
  }

  // When a language is preferred, fetch editions in that language so they aren't
  // crowded out by popular English printings. Otherwise fetch top editions by use.
  const editionsArgs = languagePref
    ? `limit: 20, order_by: { users_count: desc }, where: { language: { code2: { _eq: $language } } }`
    : `limit: 30, order_by: { users_count: desc }`;

  const enrichQuery = languagePref
    ? `
    query EnrichSearchEditionsByLanguage($ids: [Int!]!, $language: String!) {
      books(where: { id: { _in: $ids } }) {
        id
        title
        editions(${editionsArgs}) {
          id
          title
          isbn_10
          isbn_13
          asin
          pages
          edition_format
          release_date
          users_count
          image {
            url
          }
          language {
            language
            code2
          }
          country {
            name
            code2
          }
          publisher {
            name
          }
          contributions {
            ${contributionSelection()}
          }
        }
      }
    }
  `
    : `
    query EnrichSearchEditions($ids: [Int!]!) {
      books(where: { id: { _in: $ids } }) {
        id
        title
        editions(${editionsArgs}) {
          id
          title
          isbn_10
          isbn_13
          asin
          pages
          edition_format
          release_date
          users_count
          image {
            url
          }
          language {
            language
            code2
          }
          country {
            name
            code2
          }
          publisher {
            name
          }
          contributions {
            ${contributionSelection()}
          }
        }
      }
    }
  `;

  let enrichmentBooks: EnrichmentBook[] = [];
  try {
    const data = await hardcoverGraphQLRequest<{ books?: EnrichmentBook[] }>(
      enrichQuery,
      languagePref ? { ids: numericIds, language: languagePref } : { ids: numericIds }
    );
    enrichmentBooks = Array.isArray(data.books) ? data.books : [];
  } catch {
    // Presentation enrichment is best-effort; fall back to work metadata.
    return books.map((book) => ({
      ...book,
      workTitle: book.workTitle || book.title,
      presentation: book.presentation || "work",
    }));
  }

  const byId = new Map<number, EnrichmentBook>();
  for (const entry of enrichmentBooks) {
    if (typeof entry.id === "number") {
      byId.set(entry.id, entry);
    }
  }

  return books.map((book) => {
    const numericId = /^\d+$/.test(book.id) ? Number(book.id) : null;
    const enrichment = numericId !== null ? byId.get(numericId) : undefined;
    const editions = Array.isArray(enrichment?.editions) ? enrichment.editions : [];
    const workTitle = book.workTitle || book.title;

    const picked = pickPresentationEdition(query, workTitle, editions, languagePref);
    if (!picked) {
      return {
        ...book,
        workTitle,
        presentation: book.presentation || "work",
      };
    }

    const edition = picked.edition;
    const normalized = normalizeEdition(edition as HardcoverEditionDetails);
    const grouped = groupContributions(edition.contributions);
    const presentationTitle = trimToNull(edition.title) || book.title;
    const editionCover = toCoverUrl(edition.image || null);
    const { language, languageCode } = languageFromEdition(edition.language);

    return {
      ...book,
      title: presentationTitle,
      workTitle,
      cover: editionCover || book.cover,
      publicationDate:
        trimToNull(edition.release_date) || book.publicationDate,
      language,
      languageCode,
      translators:
        grouped.translators.length > 0
          ? grouped.translators.map((person) => person.name)
          : undefined,
      presentation: "edition",
      edition: normalized,
      // Authors stay work-level primary writers; don't replace with empty.
      author: book.author || authorNamesFromContributions(edition.contributions),
    };
  });
}

async function searchHardcoverBooksByIsbn(
  normalizedIsbn: string,
  limit: number
): Promise<{ totalResults: number; books: HardcoverNormalizedSearchBook[] }> {
  const fieldName = normalizedIsbn.length === 10 ? "isbn_10" : "isbn_13";
  const isbnQuery = `
    query SearchBooksByIsbn($isbn: String!, $limit: Int!) {
      editions(where: { ${fieldName}: { _eq: $isbn } }, limit: $limit) {
        ${editionSelection(false, false, true)}
        book {
          id
          slug
          title
          rating
          release_date
          cached_tags
          contributions {
            ${contributionSelection()}
          }
        }
      }
    }
  `;

  const data = await hardcoverGraphQLRequest<{
    editions?: HardcoverEditionSearchResult[];
  }>(isbnQuery, {
    isbn: normalizedIsbn,
    limit,
  });

  const editions = Array.isArray(data.editions) ? data.editions : [];
  const books = editions
    .map((edition): HardcoverNormalizedSearchBook | null => {
      const linkedBook = edition.book;
      const workTitle =
        (typeof linkedBook?.title === "string" && linkedBook.title.trim()) || "";
      // ISBN hits should present the matched edition title (e.g. "Le Petit Prince").
      const title =
        (typeof edition.title === "string" && edition.title.trim()) || workTitle;
      if (!title) {
        return null;
      }

      // Prefer edition-level authors when present; otherwise book-level authors only
      // (exclude translators/illustrators from the author string).
      const author =
        authorNamesFromContributions(edition.contributions) ||
        authorNamesFromContributions(linkedBook?.contributions ?? null);

      const grouped = groupContributions(
        edition.contributions?.length
          ? edition.contributions
          : linkedBook?.contributions ?? null
      );
      const { language, languageCode } = languageFromEdition(edition.language);

      const id =
        typeof linkedBook?.id === "number"
          ? String(linkedBook.id)
          : typeof linkedBook?.slug === "string" && linkedBook.slug
            ? linkedBook.slug
            : typeof edition.id === "number"
              ? String(edition.id)
              : title;

      return {
        id,
        title,
        workTitle: workTitle || title,
        author,
        cover: toCoverUrl(edition.image),
        rating:
          typeof linkedBook?.rating === "number" && Number.isFinite(linkedBook.rating)
            ? linkedBook.rating
            : typeof edition.rating === "number" && Number.isFinite(edition.rating)
              ? edition.rating
              : undefined,
        // Prefer the matched edition's release date for ISBN searches.
        publicationDate:
          (typeof edition.release_date === "string" && edition.release_date.trim()) ||
          (typeof linkedBook?.release_date === "string" && linkedBook.release_date.trim()) ||
          undefined,
        genres: getEditionGenres(linkedBook?.cached_tags ?? null),
        language,
        languageCode,
        translators:
          grouped.translators.length > 0
            ? grouped.translators.map((person) => person.name)
            : undefined,
        presentation: "isbn",
        edition: normalizeEdition(edition),
      };
    })
    .filter((book): book is HardcoverNormalizedSearchBook => Boolean(book));

  return {
    totalResults: books.length,
    books,
  };
}

export async function searchHardcoverBooks(input: {
  query: string;
  limit: number;
  type: string;
  language?: string;
}): Promise<{ totalResults: number; books: HardcoverNormalizedSearchBook[] }> {
  const searchQuery = `
    query SearchBooks($query: String!, $perPage: Int!, $page: Int!, $fields: String!, $weights: String!) {
      search(
        query: $query
        query_type: "Book"
        per_page: $perPage
        page: $page
        fields: $fields
        weights: $weights
      ) {
        results
      }
    }
  `;

  const broadFields = "title,isbns,series_names,author_names,alternative_titles";
  const broadWeights = "5,5,3,1,1";

  const effectiveType =
    input.type === "all" && isLikelyIsbnQuery(input.query) ? "isbn" : input.type;
  const effectiveQuery =
    effectiveType === "isbn" ? normalizeIsbnQuery(input.query) : input.query;

  const languagePref = toIso639_1(input.language);

  if (effectiveType === "isbn") {
    const result = await searchHardcoverBooksByIsbn(effectiveQuery, input.limit);
    if (!languagePref) {
      return result;
    }
    const books = result.books.filter(
      (book) => toIso639_1(book.languageCode || book.language) === languagePref
    );
    return { totalResults: books.length, books };
  }

  // A language request must be backed by an edition in that language, including
  // author searches. Without a language filter, author searches do not benefit
  // from edition presentation enrichment.
  const shouldEnrichEditions = effectiveType !== "author" || Boolean(languagePref);

  // Pull a wider candidate window so quality re-ranking can promote popular
  // complete works that Typesense buried under empty exact-title shells.
  const fetchLimit = Math.min(50, Math.max(input.limit * 3, 30));

  const data = await hardcoverGraphQLRequest<{
    search: {
      results?: HardcoverSearchResults | null;
    };
  }>(searchQuery, {
    query: effectiveQuery,
    perPage: fetchLimit,
    page: 1,
    fields: broadFields,
    weights: broadWeights,
  });

  const rawHits = Array.isArray(data.search?.results?.hits) ? data.search.results.hits : [];
  const rankableHits: RankableSearchBook[] = [];

  rawHits.forEach((hit, originalIndex) => {
    const result = hit.document;
    const title = typeof result?.title === "string" ? result.title.trim() : "";
    if (!title) {
      return;
    }

    const authorNames = toStringArray(result?.author_names);
    const genres = toStringArray(result?.genres);
    const id =
      typeof result?.id === "number" || typeof result?.id === "string"
        ? String(result.id)
        : typeof result?.slug === "string" && result.slug
          ? result.slug
          : title;

    const ratingRaw = toNumber(result?.rating);
    // Treat zero / missing ratings as absent so incomplete shells don't look scored.
    const rating =
      typeof ratingRaw === "number" && ratingRaw > 0 ? ratingRaw : undefined;

    const book: HardcoverNormalizedSearchBook = {
      id,
      title,
      workTitle: title,
      author: authorNames.join(", "),
      cover: toCoverUrl(result?.image || null),
      rating,
      publicationDate:
        typeof result?.release_date === "string" && result.release_date.trim()
          ? result.release_date
          : undefined,
      genres: genres.length > 0 ? genres : undefined,
      presentation: "work",
    };

    rankableHits.push({
      book,
      textMatch:
        typeof hit.text_match === "number" && Number.isFinite(hit.text_match)
          ? hit.text_match
          : 0,
      usersCount:
        typeof result?.users_count === "number" && Number.isFinite(result.users_count)
          ? Math.max(0, result.users_count)
          : 0,
      ratingsCount:
        typeof result?.ratings_count === "number" && Number.isFinite(result.ratings_count)
          ? Math.max(0, result.ratings_count)
          : 0,
      usersReadCount:
        typeof result?.users_read_count === "number" &&
        Number.isFinite(result.users_read_count)
          ? Math.max(0, result.users_read_count)
          : 0,
      titleSim: bestTitleSimilarity(
        effectiveQuery,
        title,
        result?.alternative_titles ?? null
      ),
      originalIndex,
    });
  });

  // Keep the wider candidate set until after language enrichment. A highly
  // ranked work may have no edition in the requested language while a lower
  // ranked work does.
  const rankedBooks = rankSearchBooks(
    rankableHits,
    languagePref ? fetchLimit : input.limit
  );

  const enrichedBooks = shouldEnrichEditions
    ? await enrichSearchHitsWithEditions(rankedBooks, effectiveQuery, languagePref)
    : rankedBooks;
  const books = (languagePref
    ? enrichedBooks.filter(
        (book) => book.languageCode?.toLowerCase() === languagePref
      )
    : enrichedBooks
  ).slice(0, input.limit);

  return {
    totalResults:
      !languagePref &&
      typeof data.search?.results?.found === "number" && Number.isFinite(data.search.results.found)
        ? data.search.results.found
        : books.length,
    books,
  };
}

export async function fetchHardcoverBookDetails(
  slugOrId: string,
  options: { editionId?: number } = {}
): Promise<HardcoverNormalizedBookDetails> {
  const cleanIsbnStr = slugOrId.replace(/[^0-9Xx]/g, "").toUpperCase();
  const isIsbn = cleanIsbnStr.length === 10 || cleanIsbnStr.length === 13;
  const rawNum = /^\d+$/.test(slugOrId) ? Number(slugOrId) : null;
  const numericId = !isIsbn && rawNum !== null && rawNum <= 2147483647 ? rawNum : null;

  const detailsSelection = `
    id
    slug
    title
    subtitle
    headline
    description
    rating
    ratings_count
    reviews_count
    release_date
    cached_tags
    featured_book_series {
      position
      details
      series {
        name
        slug
      }
    }
    book_series {
      position
      details
      featured
      series {
        name
        slug
      }
    }
    contributions {
      ${contributionSelection()}
    }
    image {
      url
    }
    default_cover_edition {
      ${editionSelection(false, false, true)}
    }
  `;

  if (isIsbn) {
    const isbnQuery = `
      query GetEditionByIsbn($isbn: String!) {
        editions(where: { _or: [{ isbn_10: { _eq: $isbn } }, { isbn_13: { _eq: $isbn } }] }, limit: 1) {
          ${editionSelection(true, false, true)}
          book {
            ${detailsSelection}
          }
        }
      }
    `;

    try {
      const isbnData = await hardcoverGraphQLRequest<{
        editions?: Array<HardcoverEditionDetails & { book?: HardcoverDetailsBook }>;
      }>(isbnQuery, { isbn: cleanIsbnStr });

      const matchedEd = Array.isArray(isbnData.editions) ? isbnData.editions[0] : null;
      if (matchedEd && matchedEd.book) {
        const book = matchedEd.book;
        const edition = matchedEd;
        const series = getSeriesLabel(book);
        const seriesURL = getSeriesUrl(book);
        const contributors = resolveContributors(book.contributions, edition.contributions);
        const { language, languageCode } = languageFromEdition(edition.language);
        const { country, countryCode } = countryFromEdition(edition.country);
        const normalizedEdition = normalizeEdition(edition) || null;

        const rating =
          typeof book.rating === "number" && Number.isFinite(book.rating)
            ? book.rating.toFixed(2)
            : "";

        const audioInfo = formatAudioLength(
          typeof (edition as any)?.audio_seconds === "number" ? (edition as any).audio_seconds : null
        );

        const displayTitle = trimToNull(edition.title) || book.title;

        return {
          scrapedURL: `https://hardcover.app/books/${book.slug}`,
          book: {
            cover: toCoverUrl(edition.image || null) || toCoverUrl(book.image),
            series,
            seriesURL,
            pages: typeof edition.pages === "number" ? edition.pages : null,
            audioLength: audioInfo.audioLength,
            audioLengthMinutes: audioInfo.audioLengthMinutes,
            slug: book.slug,
            title: displayTitle,
            author: contributors.authors,
            translator: contributors.translators[0] || null,
            translators: contributors.translators,
            illustrators: contributors.illustrators,
            narrators: contributors.narrators,
            editors: contributors.editors,
            otherContributors: contributors.other,
            rating,
            ratingCount: typeof book.ratings_count === "number" ? String(book.ratings_count) : "",
            reviewsCount: typeof book.reviews_count === "number" ? String(book.reviews_count) : "",
            description: formatBookDescription(book.headline, book.description),
            genres: getEditionGenres(book.cached_tags ?? null) || [],
            bookEdition: edition.edition_format || null,
            publishDate: edition.release_date || book.release_date || null,
            isbn: edition.isbn_13 || null,
            isbn10: edition.isbn_10 || null,
            asin: edition.asin || null,
            language,
            languageCode,
            country,
            countryCode,
            publishedBy: edition.publisher?.name || null,
            type: edition.edition_format || null,
            edition: normalizedEdition,
            related: [],
            reviewBreakdown: { rating5: "0", rating4: "0", rating3: "0", rating2: "0", rating1: "0" },
            quotes: "",
            quotesURL: "",
            questions: "",
            questionsURL: "",
            lastScraped: new Date().toISOString(),
          },
        };
      }
    } catch (isbnErr) {
      console.warn(`[Hardcover GraphQL] ISBN lookup failed for "${cleanIsbnStr}":`, isbnErr);
    }
  }

  const detailsQuery = numericId !== null
    ? `
      query GetBookDetailsById($numericId: Int!) {
        books(where: { id: { _eq: $numericId } }, limit: 1) {
          ${detailsSelection}
        }
      }
    `
    : `
      query GetBookDetailsBySlug($slug: String!) {
        books(where: { slug: { _eq: $slug } }, limit: 1) {
          ${detailsSelection}
        }
      }
    `;

  const data = await hardcoverGraphQLRequest<{ books?: HardcoverDetailsBook[] }>(
    detailsQuery,
    numericId !== null ? { numericId } : { slug: slugOrId }
  );

  const book = Array.isArray(data.books) ? data.books[0] : null;
  if (!book) {
    throw new Error(`No Hardcover book found for slug "${slugOrId}"`);
  }

  const series = getSeriesLabel(book);
  const seriesURL = getSeriesUrl(book);
  let edition: HardcoverEditionDetails | null | undefined = book.default_cover_edition;

  if (typeof options.editionId === "number") {
    const editionData = await hardcoverGraphQLRequest<{ editions?: HardcoverEditionDetails[] }>(
      `
        query GetEditionDetailsById($editionId: Int!) {
          editions(where: { id: { _eq: $editionId } }, limit: 1) {
            ${editionSelection(true, false, true)}
          }
        }
      `,
      { editionId: options.editionId }
    );
    const matchedEdition = Array.isArray(editionData.editions) ? editionData.editions[0] : null;
    if (!matchedEdition) {
      throw new Error(`No Hardcover edition found for editionId "${options.editionId}"`);
    }

    const matchesBook =
      (typeof matchedEdition.book?.id === "number" && matchedEdition.book.id === book.id) ||
      (typeof matchedEdition.book?.slug === "string" && matchedEdition.book.slug === book.slug);
    if (!matchesBook) {
      throw new Error(
        `Hardcover editionId "${options.editionId}" does not belong to book "${slugOrId}"`
      );
    }

    edition = matchedEdition;
  }

  const contributors = resolveContributors(book.contributions, edition?.contributions);
  const { language, languageCode } = languageFromEdition(edition?.language);
  const { country, countryCode } = countryFromEdition(edition?.country);
  const normalizedEdition = normalizeEdition(edition) || null;

  const rating =
    typeof book.rating === "number" && Number.isFinite(book.rating)
      ? book.rating.toFixed(2)
      : "";

  // Prefer edition title for a specific matched version (ISBN / editionId);
  // otherwise keep the work title.
  const displayTitle =
    (typeof options.editionId === "number" && trimToNull(edition?.title)) || book.title;

  return {
    scrapedURL: `https://hardcover.app/books/${book.slug}`,
    book: {
      cover: toCoverUrl(edition?.image || null) || toCoverUrl(book.image),
      series,
      seriesURL,
      pages: typeof edition?.pages === "number" ? edition.pages : null,
      slug: book.slug,
      title: displayTitle,
      author: contributors.authors,
      translator: contributors.translators[0] || null,
      translators: contributors.translators,
      illustrators: contributors.illustrators,
      narrators: contributors.narrators,
      editors: contributors.editors,
      otherContributors: contributors.other,
      rating,
      ratingCount:
        typeof book.ratings_count === "number" ? String(book.ratings_count) : "",
      reviewsCount:
        typeof book.reviews_count === "number" ? String(book.reviews_count) : "",
      description: formatBookDescription(book.headline, book.description),
      genres: getEditionGenres(book.cached_tags ?? null) || [],
      bookEdition: trimToNull(edition?.edition_format),
      publishDate:
        trimToNull(edition?.release_date) || trimToNull(book.release_date),
      isbn: trimToNull(edition?.isbn_13),
      isbn10: trimToNull(edition?.isbn_10),
      asin: trimToNull(edition?.asin),
      language,
      languageCode,
      country,
      countryCode,
      publishedBy: trimToNull(edition?.publisher?.name),
      type: trimToNull(edition?.edition_format),
      edition: normalizedEdition,
      related: [],
      reviewBreakdown: {
        rating5: "",
        rating4: "",
        rating3: "",
        rating2: "",
        rating1: "",
      },
      quotes: "",
      quotesURL: "",
      questions: "",
      questionsURL: "",
      lastScraped: new Date().toISOString(),
    },
  };
}

type HardcoverCoversEdition = {
  id?: number | null;
  title?: string | null;
  release_date?: string | null;
  pages?: number | null;
  edition_format?: string | null;
  isbn_10?: string | null;
  isbn_13?: string | null;
  asin?: string | null;
  image?: HardcoverImage;
  publisher?: {
    name?: string | null;
  } | null;
  language?: HardcoverLanguage;
  country?: HardcoverCountry;
};

type HardcoverCoversBook = {
  id: number;
  slug: string;
  title: string;
  default_cover_edition_id?: number | null;
  editions?: HardcoverCoversEdition[] | null;
  editions_count?: number | null;
};

export type HardcoverNormalizedEditionCover = {
  editionId: number;
  title: string | null;
  url: string;
  width: number | null;
  height: number | null;
  ratio: number | null;
  color: string | null;
  pixelCount: number | null;
  imageId: number | null;
  format: string | null;
  isbn: string | null;
  isbn10: string | null;
  asin: string | null;
  publicationDate: string | null;
  pages: number | null;
  publisher: string | null;
  language: string | null;
  languageCode: string | null;
  country: string | null;
  countryCode: string | null;
  isDefault: boolean;
};

export type HardcoverNormalizedBookCovers = {
  scrapedURL: string;
  book: {
    id: string;
    slug: string;
    title: string;
  };
  covers: HardcoverNormalizedEditionCover[];
  bestByResolution: {
    editionId: number;
    url: string;
    width: number | null;
    height: number | null;
    pixelCount: number | null;
  } | null;
  totalCovers: number;
  totalEditions: number;
};

/**
 * Fetch edition covers for a book, including Hardcover image dimensions when available.
 * Sorted by resolution (pixel count) descending; default cover preferred on ties.
 */
export async function fetchHardcoverBookCovers(
  slugOrId: string,
  options: { limit?: number; onlyWithCover?: boolean } = {}
): Promise<HardcoverNormalizedBookCovers> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const onlyWithCover = options.onlyWithCover !== false;
  const numericId = /^\d+$/.test(slugOrId) ? Number(slugOrId) : null;

  const coversSelection = `
    id
    slug
    title
    default_cover_edition_id
    editions_count
    editions(limit: $limit, order_by: { users_count: desc }) {
      id
      title
      release_date
      pages
      edition_format
      isbn_10
      isbn_13
      asin
      image {
        ${imageSelection()}
      }
      publisher {
        name
      }
      language {
        language
        code2
      }
      country {
        name
        code2
      }
    }
  `;

  const coversQuery =
    numericId !== null
      ? `
      query GetBookCoversById($numericId: Int!, $limit: Int!) {
        books(where: { id: { _eq: $numericId } }, limit: 1) {
          ${coversSelection}
        }
      }
    `
      : `
      query GetBookCoversBySlug($slug: String!, $limit: Int!) {
        books(where: { slug: { _eq: $slug } }, limit: 1) {
          ${coversSelection}
        }
      }
    `;

  const data = await hardcoverGraphQLRequest<{ books?: HardcoverCoversBook[] }>(
    coversQuery,
    numericId !== null
      ? { numericId, limit }
      : { slug: slugOrId, limit }
  );

  const book = Array.isArray(data.books) ? data.books[0] : null;
  if (!book) {
    throw new Error(`No Hardcover book found for slug "${slugOrId}"`);
  }

  const defaultCoverEditionId =
    typeof book.default_cover_edition_id === "number"
      ? book.default_cover_edition_id
      : null;

  const rawEditions = Array.isArray(book.editions) ? book.editions : [];
  const totalEditions =
    typeof book.editions_count === "number" && Number.isFinite(book.editions_count)
      ? book.editions_count
      : rawEditions.length;

  const covers: HardcoverNormalizedEditionCover[] = [];

  for (const edition of rawEditions) {
    if (typeof edition?.id !== "number") {
      continue;
    }

    const imageMeta = normalizeImageMeta(edition.image || null);
    if (onlyWithCover && !imageMeta.url) {
      continue;
    }

    const { language, languageCode } = languageFromEdition(edition.language);
    const { country, countryCode } = countryFromEdition(edition.country);

    covers.push({
      editionId: edition.id,
      title: trimToNull(edition.title),
      url: imageMeta.url,
      width: imageMeta.width,
      height: imageMeta.height,
      ratio: imageMeta.ratio,
      color: imageMeta.color,
      pixelCount: imageMeta.pixelCount,
      imageId: imageMeta.imageId,
      format: trimToNull(edition.edition_format),
      isbn: trimToNull(edition.isbn_13),
      isbn10: trimToNull(edition.isbn_10),
      asin: trimToNull(edition.asin),
      publicationDate: trimToNull(edition.release_date),
      pages: typeof edition.pages === "number" ? edition.pages : null,
      publisher: trimToNull(edition.publisher?.name),
      language,
      languageCode,
      country,
      countryCode,
      isDefault: defaultCoverEditionId === edition.id,
    });
  }

  // Prefer higher resolution; on equal/unknown resolution prefer default cover, then edition id.
  covers.sort((a, b) => {
    const aPixels = a.pixelCount ?? -1;
    const bPixels = b.pixelCount ?? -1;
    if (aPixels !== bPixels) {
      return bPixels - aPixels;
    }
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    return a.editionId - b.editionId;
  });

  const best =
    covers.find((cover) => cover.url && cover.pixelCount !== null) ||
    covers.find((cover) => cover.url) ||
    null;

  return {
    scrapedURL: `https://hardcover.app/books/${book.slug}`,
    book: {
      id: String(book.id),
      slug: book.slug,
      title: book.title,
    },
    covers,
    bestByResolution: best
      ? {
          editionId: best.editionId,
          url: best.url,
          width: best.width,
          height: best.height,
          pixelCount: best.pixelCount,
        }
      : null,
    totalCovers: covers.filter((cover) => Boolean(cover.url)).length,
    totalEditions,
  };
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

type HardcoverSeriesSearchResult = {
  id?: number | string;
  slug?: string;
  name?: string;
  author_name?: string;
  books_count?: number;
  primary_books_count?: number;
  readers_count?: number;
  books?: string[];
  author?: {
    id?: number | null;
    name?: string | null;
    slug?: string | null;
  } | null;
};

type HardcoverSeriesSearchHit = {
  document?: HardcoverSeriesSearchResult | null;
};

type HardcoverSeriesSearchResults = {
  found?: number | null;
  hits?: HardcoverSeriesSearchHit[] | null;
};

export type HardcoverNormalizedSearchSeries = {
  id: string;
  name: string;
  slug: string;
  author?: string;
  booksCount?: number;
  primaryBooksCount?: number;
  readersCount?: number;
  sampleBooks?: string[];
};

export type HardcoverNormalizedSeriesBook = {
  id: string;
  slug: string;
  title: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string | null;
  position: number | null;
  positionLabel: string | null;
  featured: boolean;
  compilation: boolean;
  languageCode: string | null;
  language: string | null;
  format: string | null;
  formatLabel: string | null;
};

export type HardcoverNormalizedSeriesDetails = {
  scrapedURL: string;
  series: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    booksCount: number;
    primaryBooksCount: number | null;
    isCompleted: boolean | null;
    author: { id: number; name: string; url: string } | null;
  };
  books: HardcoverNormalizedSeriesBook[];
  filters: {
    language: string;
    resolvedLanguage: string | null;
    originalLanguage: string | null;
    format: string | null;
    dedupedByPosition: boolean;
  };
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
  };
};

type HardcoverEditionLangFormat = {
  id?: number | null;
  title?: string | null;
  edition_format?: string | null;
  language?: {
    code2?: string | null;
    language?: string | null;
  } | null;
  reading_format?: {
    id?: number | null;
    format?: string | null;
  } | null;
  image?: HardcoverImage;
};

type HardcoverSeriesDetailsRow = {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  books_count?: number | null;
  primary_books_count?: number | null;
  is_completed?: boolean | null;
  author?: {
    id?: number | null;
    name?: string | null;
    slug?: string | null;
  } | null;
  book_series?: Array<{
    id?: number | null;
    position?: number | null;
    details?: string | null;
    featured?: boolean | null;
    compilation?: boolean | null;
    book?: {
      id?: number | null;
      slug?: string | null;
      title?: string | null;
      rating?: number | null;
      release_date?: string | null;
      contributions?: HardcoverContribution[] | null;
      image?: HardcoverImage;
      default_cover_edition?: HardcoverEditionLangFormat | null;
      default_physical_edition?: HardcoverEditionLangFormat | null;
      default_ebook_edition?: HardcoverEditionLangFormat | null;
      default_audio_edition?: HardcoverEditionLangFormat | null;
      editions?: HardcoverEditionLangFormat[] | null;
    } | null;
  }> | null;
};

/** Max series membership rows to pull before language/format filtering. */
const SERIES_BOOKS_FETCH_CAP = 200;

/**
 * Normalized edition formats.
 * - `physical` is only a filter alias meaning hardcover OR paperback
 * - editions themselves are classified as hardcover | paperback | ebook | audiobook
 */
type SeriesFormatFilter =
  | "ebook"
  | "audiobook"
  | "hardcover"
  | "paperback"
  | "physical";

const PRINT_FORMATS = new Set<SeriesFormatFilter>(["hardcover", "paperback"]);

function normalizeLanguageParam(value: string | undefined | null): string {
  const raw = (value ?? "original").trim().toLowerCase();
  if (!raw || raw === "original" || raw === "default" || raw === "auto") {
    return "original";
  }
  // Accept en, es, eng, spa-ish short codes; keep first token of "es-ES"
  const code = raw.split(/[-_]/)[0] || raw;
  if (!/^[a-z]{2,3}$/.test(code)) {
    throw new Error(
      "Invalid language parameter. Use an ISO code like en or es, or original"
    );
  }
  return code;
}

function normalizeFormatParam(
  value: string | undefined | null
): SeriesFormatFilter | null {
  if (value === undefined || value === null || value.trim() === "") {
    return null;
  }

  const raw = value.trim().toLowerCase();
  if (["any", "all", "*"].includes(raw)) {
    return null;
  }
  if (["ebook", "e-book", "e_book", "kindle", "digital"].includes(raw)) {
    return "ebook";
  }
  if (["audiobook", "audio", "audible", "listened"].includes(raw)) {
    return "audiobook";
  }
  if (
    ["hardcover", "hardback", "hard cover", "hard-cover", "board book"].includes(
      raw
    )
  ) {
    return "hardcover";
  }
  if (
    [
      "paperback",
      "softcover",
      "soft cover",
      "soft-cover",
      "mass market",
      "trade paperback",
      "pocket",
    ].includes(raw)
  ) {
    return "paperback";
  }
  // physical / print = either hardcover or paperback
  if (["physical", "print", "book"].includes(raw)) {
    return "physical";
  }

  throw new Error(
    "Invalid format parameter. Valid options: ebook, audiobook, hardcover, paperback, physical"
  );
}

function normalizeFormatLabel(
  editionFormat: string | null | undefined,
  readingFormat: string | null | undefined
): SeriesFormatFilter | null {
  const edition = (editionFormat || "").toLowerCase();
  const reading = (readingFormat || "").toLowerCase();
  const combined = `${edition} ${reading}`.trim();
  if (!combined) {
    return null;
  }

  // Digital first — Kindle/ebook can still say "Read" in reading_format.
  if (
    edition.includes("ebook") ||
    edition.includes("e-book") ||
    edition.includes("kindle") ||
    reading === "ebook"
  ) {
    return "ebook";
  }
  if (
    edition.includes("audio") ||
    edition.includes("audible") ||
    edition.includes("mp3") ||
    reading === "listened"
  ) {
    return "audiobook";
  }

  // Specific print bindings (prefer these over a generic physical bucket).
  if (
    edition.includes("hardcover") ||
    edition.includes("hardback") ||
    edition.includes("hard cover") ||
    edition.includes("library binding") ||
    edition.includes("board book")
  ) {
    return "hardcover";
  }
  if (
    edition.includes("paperback") ||
    edition.includes("softcover") ||
    edition.includes("soft cover") ||
    edition.includes("mass market") ||
    edition.includes("trade paper")
  ) {
    return "paperback";
  }

  return null;
}

/** Whether an edition's normalized format satisfies a format filter. */
function formatMatchesFilter(
  entryFormat: SeriesFormatFilter | null,
  filter: SeriesFormatFilter | null
): boolean {
  if (!filter) {
    return true;
  }
  if (!entryFormat) {
    return false;
  }
  if (filter === "physical") {
    return PRINT_FORMATS.has(entryFormat);
  }
  return entryFormat === filter;
}

function collectEditionLanguage(
  edition: HardcoverEditionLangFormat | null | undefined
): { code: string; name: string } | null {
  const code = edition?.language?.code2?.trim().toLowerCase();
  if (!code) {
    return null;
  }
  return {
    code,
    name: edition?.language?.language?.trim() || code,
  };
}

type SeriesBookCandidate = {
  entryPosition: number | null;
  positionLabel: string | null;
  featured: boolean;
  compilation: boolean;
  id: string;
  slug: string;
  title: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate: string | null;
  primaryLanguageCode: string | null;
  primaryLanguageName: string | null;
  availableLanguageCodes: Set<string>;
  languageEditions: Map<
    string,
    Array<{
      title: string | null;
      cover: string;
      format: SeriesFormatFilter | null;
      formatLabel: string | null;
      languageCode: string;
      languageName: string;
    }>
  >;
  hasEbook: boolean;
  hasAudiobook: boolean;
  hasPhysical: boolean;
  defaultFormat: SeriesFormatFilter | null;
  defaultFormatLabel: string | null;
  ebookPresentation: {
    title: string | null;
    cover: string;
    formatLabel: string | null;
    languageCode: string | null;
    languageName: string | null;
  } | null;
  audiobookPresentation: {
    title: string | null;
    cover: string;
    formatLabel: string | null;
    languageCode: string | null;
    languageName: string | null;
  } | null;
  physicalPresentation: {
    title: string | null;
    cover: string;
    formatLabel: string | null;
    languageCode: string | null;
    languageName: string | null;
  } | null;
};

function buildSeriesBookCandidate(
  entry: NonNullable<HardcoverSeriesDetailsRow["book_series"]>[number],
  fallbackAuthor: string
): SeriesBookCandidate | null {
  const book = entry.book;
  const title = typeof book?.title === "string" ? book.title.trim() : "";
  if (!title) {
    return null;
  }

  const authorsList = authorNamesFromContributions(book?.contributions ?? null);
  const authors = authorsList ? authorsList.split(", ") : [];

  const id =
    typeof book?.id === "number"
      ? String(book.id)
      : typeof book?.slug === "string" && book.slug
        ? book.slug
        : title;

  const baseCover =
    toCoverUrl(book?.image || null) ||
    toCoverUrl(book?.default_cover_edition?.image || null) ||
    toCoverUrl(book?.default_physical_edition?.image || null) ||
    toCoverUrl(book?.default_ebook_edition?.image || null) ||
    "";

  const languageEditions = new Map<
    string,
    Array<{
      title: string | null;
      cover: string;
      format: SeriesFormatFilter | null;
      formatLabel: string | null;
      languageCode: string;
      languageName: string;
    }>
  >();
  const availableLanguageCodes = new Set<string>();

  const considerEdition = (edition: HardcoverEditionLangFormat | null | undefined) => {
    const lang = collectEditionLanguage(edition);
    if (!lang) {
      return;
    }
    availableLanguageCodes.add(lang.code);
    const formatLabel =
      trimToNull(edition?.edition_format) ||
      trimToNull(edition?.reading_format?.format);
    const format = normalizeFormatLabel(
      edition?.edition_format,
      edition?.reading_format?.format
    );
    const list = languageEditions.get(lang.code) || [];
    list.push({
      title: trimToNull(edition?.title),
      cover: toCoverUrl(edition?.image || null),
      format,
      formatLabel,
      languageCode: lang.code,
      languageName: lang.name,
    });
    languageEditions.set(lang.code, list);
  };

  considerEdition(book?.default_cover_edition);
  considerEdition(book?.default_physical_edition);
  considerEdition(book?.default_ebook_edition);
  considerEdition(book?.default_audio_edition);
  for (const edition of book?.editions || []) {
    considerEdition(edition);
  }

  // Primary language preference: cover → physical → ebook → audio → first known
  const primary =
    collectEditionLanguage(book?.default_cover_edition) ||
    collectEditionLanguage(book?.default_physical_edition) ||
    collectEditionLanguage(book?.default_ebook_edition) ||
    collectEditionLanguage(book?.default_audio_edition) ||
    null;

  const hasEbook = Boolean(
    book?.default_ebook_edition?.id ||
      [...(book?.editions || [])].some(
        (edition) =>
          normalizeFormatLabel(edition.edition_format, edition.reading_format?.format) ===
          "ebook"
      )
  );
  const hasAudiobook = Boolean(
    book?.default_audio_edition?.id ||
      [...(book?.editions || [])].some(
        (edition) =>
          normalizeFormatLabel(edition.edition_format, edition.reading_format?.format) ===
          "audiobook"
      )
  );
  const hasPhysical = Boolean(
    book?.default_physical_edition?.id ||
      [...(book?.editions || [])].some((edition) => {
        const format = normalizeFormatLabel(
          edition.edition_format,
          edition.reading_format?.format
        );
        return format !== null && PRINT_FORMATS.has(format);
      })
  );

  const defaultFormat =
    normalizeFormatLabel(
      book?.default_cover_edition?.edition_format,
      book?.default_cover_edition?.reading_format?.format
    ) ||
    normalizeFormatLabel(
      book?.default_physical_edition?.edition_format,
      book?.default_physical_edition?.reading_format?.format
    ) ||
    (hasEbook ? "ebook" : null) ||
    (hasAudiobook ? "audiobook" : null);

  const defaultFormatLabel =
    trimToNull(book?.default_cover_edition?.edition_format) ||
    trimToNull(book?.default_cover_edition?.reading_format?.format) ||
    trimToNull(book?.default_physical_edition?.edition_format) ||
    trimToNull(book?.default_ebook_edition?.edition_format) ||
    null;

  const presentationFromEdition = (
    edition: HardcoverEditionLangFormat | null | undefined
  ) => {
    if (!edition) {
      return null;
    }
    const lang = collectEditionLanguage(edition);
    return {
      title: trimToNull(edition.title),
      cover: toCoverUrl(edition.image || null),
      formatLabel:
        trimToNull(edition.edition_format) ||
        trimToNull(edition.reading_format?.format),
      languageCode: lang?.code ?? null,
      languageName: lang?.name ?? null,
    };
  };

  return {
    entryPosition:
      typeof entry.position === "number" && Number.isFinite(entry.position)
        ? entry.position
        : null,
    positionLabel: trimToNull(entry.details),
    featured: Boolean(entry.featured),
    compilation: Boolean(entry.compilation),
    id,
    slug: typeof book?.slug === "string" ? book.slug : id,
    title,
    author: authors.join(", ") || fallbackAuthor,
    cover: baseCover,
    rating: toNumber(book?.rating),
    publicationDate: trimToNull(book?.release_date),
    primaryLanguageCode: primary?.code ?? null,
    primaryLanguageName: primary?.name ?? null,
    availableLanguageCodes,
    languageEditions,
    hasEbook,
    hasAudiobook,
    hasPhysical,
    defaultFormat,
    defaultFormatLabel,
    ebookPresentation: presentationFromEdition(book?.default_ebook_edition),
    audiobookPresentation: presentationFromEdition(book?.default_audio_edition),
    physicalPresentation: presentationFromEdition(book?.default_physical_edition),
  };
}

function inferOriginalLanguage(candidates: SeriesBookCandidate[]): string | null {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    if (candidate.compilation) {
      continue;
    }
    const code = candidate.primaryLanguageCode;
    if (!code) {
      continue;
    }
    // Weight featured books more heavily when inferring the series original language.
    const weight = candidate.featured ? 3 : 1;
    counts.set(code, (counts.get(code) || 0) + weight);
  }

  let best: string | null = null;
  let bestScore = -1;
  for (const [code, score] of counts) {
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }

  return best;
}

function pickEditionForFilters(
  candidate: SeriesBookCandidate,
  languageCode: string | null,
  format: SeriesFormatFilter | null
): {
  title: string;
  cover: string;
  languageCode: string | null;
  languageName: string | null;
  format: SeriesFormatFilter | null;
  formatLabel: string | null;
} {
  const languageEditions = languageCode
    ? candidate.languageEditions.get(languageCode) || []
    : [];

  if (languageCode && languageEditions.length > 0) {
    const formatMatch = format
      ? languageEditions.find((edition) =>
          formatMatchesFilter(edition.format, format)
        )
      : undefined;
    const chosen = formatMatch || languageEditions[0];
    if (chosen) {
      // If a specific format was requested but the language edition is a different
      // format, still prefer default_* presentation for that format when present.
      if (format && !formatMatchesFilter(chosen.format, format)) {
        const formatDefault =
          format === "ebook"
            ? candidate.ebookPresentation
            : format === "audiobook"
              ? candidate.audiobookPresentation
              : candidate.physicalPresentation;
        if (formatDefault) {
          const resolvedPrint =
            format === "physical"
              ? normalizeFormatLabel(formatDefault.formatLabel, null) ||
                chosen.format ||
                "hardcover"
              : format;
          return {
            title: formatDefault.title || chosen.title || candidate.title,
            cover: formatDefault.cover || chosen.cover || candidate.cover,
            languageCode: formatDefault.languageCode || chosen.languageCode,
            languageName: formatDefault.languageName || chosen.languageName,
            format: resolvedPrint,
            formatLabel: formatDefault.formatLabel || chosen.formatLabel,
          };
        }
      }

      return {
        title: chosen.title || candidate.title,
        cover: chosen.cover || candidate.cover,
        languageCode: chosen.languageCode,
        languageName: chosen.languageName,
        format: chosen.format || format || candidate.defaultFormat,
        formatLabel: chosen.formatLabel || candidate.defaultFormatLabel,
      };
    }
  }

  // Format-first defaults when language-specific editions are missing.
  if (format === "ebook" && candidate.ebookPresentation) {
    return {
      title: candidate.ebookPresentation.title || candidate.title,
      cover: candidate.ebookPresentation.cover || candidate.cover,
      languageCode:
        candidate.ebookPresentation.languageCode || candidate.primaryLanguageCode,
      languageName:
        candidate.ebookPresentation.languageName || candidate.primaryLanguageName,
      format: "ebook",
      formatLabel: candidate.ebookPresentation.formatLabel,
    };
  }
  if (format === "audiobook" && candidate.audiobookPresentation) {
    return {
      title: candidate.audiobookPresentation.title || candidate.title,
      cover: candidate.audiobookPresentation.cover || candidate.cover,
      languageCode:
        candidate.audiobookPresentation.languageCode ||
        candidate.primaryLanguageCode,
      languageName:
        candidate.audiobookPresentation.languageName ||
        candidate.primaryLanguageName,
      format: "audiobook",
      formatLabel: candidate.audiobookPresentation.formatLabel,
    };
  }
  if (
    (format === "physical" || format === "hardcover" || format === "paperback") &&
    candidate.physicalPresentation
  ) {
    const printFormat =
      normalizeFormatLabel(candidate.physicalPresentation.formatLabel, null) ||
      (format === "paperback" ? "paperback" : format === "hardcover" ? "hardcover" : null) ||
      candidate.defaultFormat;
    return {
      title: candidate.physicalPresentation.title || candidate.title,
      cover: candidate.physicalPresentation.cover || candidate.cover,
      languageCode:
        candidate.physicalPresentation.languageCode ||
        candidate.primaryLanguageCode,
      languageName:
        candidate.physicalPresentation.languageName ||
        candidate.primaryLanguageName,
      format: printFormat && PRINT_FORMATS.has(printFormat) ? printFormat : "hardcover",
      formatLabel: candidate.physicalPresentation.formatLabel,
    };
  }

  let resolvedFormat = candidate.defaultFormat;
  if (format === "ebook" && candidate.hasEbook) {
    resolvedFormat = "ebook";
  } else if (format === "audiobook" && candidate.hasAudiobook) {
    resolvedFormat = "audiobook";
  } else if (
    (format === "physical" || format === "hardcover" || format === "paperback") &&
    candidate.hasPhysical
  ) {
    resolvedFormat =
      format === "physical"
        ? candidate.defaultFormat && PRINT_FORMATS.has(candidate.defaultFormat)
          ? candidate.defaultFormat
          : "hardcover"
        : format;
  }

  return {
    title: candidate.title,
    cover: candidate.cover,
    languageCode: candidate.primaryLanguageCode,
    languageName: candidate.primaryLanguageName,
    format: resolvedFormat,
    formatLabel: candidate.defaultFormatLabel,
  };
}

function scoreSeriesCandidate(
  candidate: SeriesBookCandidate,
  languageCode: string | null,
  format: SeriesFormatFilter | null
): number {
  let score = 0;

  if (candidate.featured) score += 50;
  if (!candidate.compilation) score += 40;
  if (candidate.cover) score += 5;

  if (languageCode) {
    if (candidate.primaryLanguageCode === languageCode) {
      score += 200;
    } else if (candidate.availableLanguageCodes.has(languageCode)) {
      score += 120;
    } else if (candidate.primaryLanguageCode) {
      // Known different language — strongly deprioritize
      score -= 500;
    } else {
      // Unknown language metadata: only keep as weak fallback
      score -= 20;
    }
  }

  if (format === "ebook") {
    if (candidate.hasEbook) score += 80;
    else score -= 300;
  } else if (format === "audiobook") {
    if (candidate.hasAudiobook) score += 80;
    else score -= 300;
  } else if (format === "physical") {
    if (candidate.hasPhysical) score += 80;
    else score -= 100;
  } else if (format === "hardcover" || format === "paperback") {
    const langEditions = languageCode
      ? candidate.languageEditions.get(languageCode) || []
      : [];
    const hasSpecific =
      candidate.defaultFormat === format ||
      langEditions.some((edition) => edition.format === format) ||
      [...candidate.languageEditions.values()].some((list) =>
        list.some((edition) => edition.format === format)
      );
    if (hasSpecific) score += 80;
    else if (candidate.hasPhysical) score += 20; // print available but binding unclear
    else score -= 100;
  }

  return score;
}

function positionSortKey(position: number | null): number {
  return position === null || Number.isNaN(position) ? Number.POSITIVE_INFINITY : position;
}

export async function searchHardcoverSeries(input: {
  query: string;
  limit: number;
}): Promise<{ totalResults: number; series: HardcoverNormalizedSearchSeries[] }> {
  const searchQuery = `
    query SearchSeries($query: String!, $perPage: Int!, $page: Int!) {
      search(
        query: $query
        query_type: "Series"
        per_page: $perPage
        page: $page
      ) {
        results
      }
    }
  `;

  const data = await hardcoverGraphQLRequest<{
    search: {
      results?: HardcoverSeriesSearchResults | null;
    };
  }>(searchQuery, {
    query: input.query,
    perPage: input.limit,
    page: 1,
  });

  const rawHits = Array.isArray(data.search?.results?.hits)
    ? data.search.results.hits
    : [];

  const series = rawHits
    .map((hit): HardcoverNormalizedSearchSeries | null => {
      const result = hit.document;
      const name = typeof result?.name === "string" ? result.name.trim() : "";
      if (!name) {
        return null;
      }

      const slug =
        typeof result?.slug === "string" && result.slug.trim()
          ? result.slug.trim()
          : "";
      const id =
        typeof result?.id === "number" || typeof result?.id === "string"
          ? String(result.id)
          : slug || name;

      const authorFromObject = result?.author?.name?.trim() || "";
      const authorFromField =
        typeof result?.author_name === "string" ? result.author_name.trim() : "";
      const author = authorFromObject || authorFromField || undefined;

      const sampleBooks = Array.isArray(result?.books)
        ? result.books
            .map((title) => (typeof title === "string" ? title.trim() : ""))
            .filter(Boolean)
            .slice(0, 10)
        : undefined;

      return {
        id,
        name,
        slug: slug || id,
        author,
        booksCount: toNumber(result?.books_count),
        primaryBooksCount: toNumber(result?.primary_books_count),
        readersCount: toNumber(result?.readers_count),
        sampleBooks: sampleBooks && sampleBooks.length > 0 ? sampleBooks : undefined,
      };
    })
    .filter((entry): entry is HardcoverNormalizedSearchSeries => Boolean(entry));

  return {
    totalResults:
      typeof data.search?.results?.found === "number" &&
      Number.isFinite(data.search.results.found)
        ? data.search.results.found
        : series.length,
    series,
  };
}

export async function fetchHardcoverSeriesDetails(
  slugOrId: string,
  options: {
    limit?: number;
    offset?: number;
    language?: string;
    format?: string;
  } = {}
): Promise<HardcoverNormalizedSeriesDetails> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const languageParam = normalizeLanguageParam(options.language);
  const formatFilter = normalizeFormatParam(options.format);
  const numericId = /^\d+$/.test(slugOrId) ? Number(slugOrId) : null;

  const editionFields = `
    id
    title
    edition_format
    language {
      code2
      language
    }
    reading_format {
      id
      format
    }
    image {
      url
    }
  `;

  const seriesSelection = `
    id
    slug
    name
    description
    books_count
    primary_books_count
    is_completed
    author {
      id
      name
      slug
    }
    book_series(
      limit: $fetchLimit
      order_by: [{ position: asc }, { featured: desc }]
    ) {
      id
      position
      details
      featured
      compilation
      book {
        id
        slug
        title
        rating
        release_date
        contributions {
          ${contributionSelection()}
        }
        image {
          url
        }
        default_cover_edition {
          ${editionFields}
        }
        default_physical_edition {
          ${editionFields}
        }
        default_ebook_edition {
          ${editionFields}
        }
        default_audio_edition {
          ${editionFields}
        }
        editions(
          where: { language_id: { _is_null: false } }
          limit: 12
          order_by: { users_count: desc }
        ) {
          ${editionFields}
        }
      }
    }
  `;

  const detailsQuery =
    numericId !== null
      ? `
      query GetSeriesDetailsById($numericId: Int!, $fetchLimit: Int!) {
        series(where: { id: { _eq: $numericId } }, limit: 1) {
          ${seriesSelection}
        }
      }
    `
      : `
      query GetSeriesDetailsBySlug($slug: String!, $fetchLimit: Int!) {
        series(where: { slug: { _eq: $slug } }, limit: 1) {
          ${seriesSelection}
        }
      }
    `;

  const data = await hardcoverGraphQLRequest<{ series?: HardcoverSeriesDetailsRow[] }>(
    detailsQuery,
    numericId !== null
      ? { numericId, fetchLimit: SERIES_BOOKS_FETCH_CAP }
      : { slug: slugOrId, fetchLimit: SERIES_BOOKS_FETCH_CAP }
  );

  const series = Array.isArray(data.series) ? data.series[0] : null;
  if (!series) {
    throw new Error(`No Hardcover series found for slug "${slugOrId}"`);
  }

  const authorName = series.author?.name?.trim() || "";
  const author =
    authorName
      ? {
          id: typeof series.author?.id === "number" ? series.author.id : 0,
          name: authorName,
          url: series.author?.slug
            ? `https://hardcover.app/authors/${series.author.slug}`
            : "",
        }
      : null;

  const booksCount =
    typeof series.books_count === "number" && Number.isFinite(series.books_count)
      ? series.books_count
      : 0;

  const rawEntries = Array.isArray(series.book_series) ? series.book_series : [];
  const candidates = rawEntries
    .map((entry) => buildSeriesBookCandidate(entry, authorName))
    .filter((entry): entry is SeriesBookCandidate => Boolean(entry));

  const originalLanguage = inferOriginalLanguage(candidates);
  const resolvedLanguage =
    languageParam === "original" ? originalLanguage : languageParam;

  // Group by position and pick the best language/format match per slot.
  const byPosition = new Map<string, SeriesBookCandidate[]>();
  for (const candidate of candidates) {
    const key =
      candidate.entryPosition === null ? "null" : String(candidate.entryPosition);
    const list = byPosition.get(key) || [];
    list.push(candidate);
    byPosition.set(key, list);
  }

  const selected: HardcoverNormalizedSeriesBook[] = [];

  for (const [, group] of byPosition) {
    let best: SeriesBookCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of group) {
      // Hard filter: if a language is resolved, require match or available edition.
      if (resolvedLanguage) {
        const matchesPrimary = candidate.primaryLanguageCode === resolvedLanguage;
        const hasEdition = candidate.availableLanguageCodes.has(resolvedLanguage);
        if (!matchesPrimary && !hasEdition) {
          continue;
        }
      }

      if (formatFilter) {
        const langEditions = resolvedLanguage
          ? candidate.languageEditions.get(resolvedLanguage) || []
          : [];
        const allEditionFormats = [
          ...langEditions.map((edition) => edition.format),
          ...[...candidate.languageEditions.values()].flatMap((list) =>
            list.map((edition) => edition.format)
          ),
          candidate.defaultFormat,
        ];
        const hasMatchingFormat = allEditionFormats.some((entryFormat) =>
          formatMatchesFilter(entryFormat, formatFilter)
        );
        const hasFormatBucket =
          (formatFilter === "ebook" && candidate.hasEbook) ||
          (formatFilter === "audiobook" && candidate.hasAudiobook) ||
          ((formatFilter === "physical" ||
            formatFilter === "hardcover" ||
            formatFilter === "paperback") &&
            candidate.hasPhysical);

        if (!hasMatchingFormat && !hasFormatBucket) {
          continue;
        }
      }

      const score = scoreSeriesCandidate(candidate, resolvedLanguage, formatFilter);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best || bestScore < 0) {
      continue;
    }

    const presentation = pickEditionForFilters(best, resolvedLanguage, formatFilter);

    selected.push({
      id: best.id,
      slug: best.slug,
      title: presentation.title,
      author: best.author,
      cover: presentation.cover,
      rating: best.rating,
      publicationDate: best.publicationDate,
      position: best.entryPosition,
      positionLabel: best.positionLabel,
      featured: best.featured,
      compilation: best.compilation,
      languageCode: presentation.languageCode,
      language: presentation.languageName,
      format: presentation.format,
      formatLabel: presentation.formatLabel,
    });
  }

  selected.sort((a, b) => {
    const posDiff = positionSortKey(a.position) - positionSortKey(b.position);
    if (posDiff !== 0) return posDiff;
    return a.title.localeCompare(b.title);
  });

  const totalFiltered = selected.length;
  const page = selected.slice(offset, offset + limit);

  return {
    scrapedURL: `https://hardcover.app/series/${series.slug}`,
    series: {
      id: String(series.id),
      slug: series.slug,
      name: series.name,
      description: trimToNull(series.description),
      booksCount,
      primaryBooksCount:
        typeof series.primary_books_count === "number"
          ? series.primary_books_count
          : null,
      isCompleted:
        typeof series.is_completed === "boolean" ? series.is_completed : null,
      author,
    },
    books: page,
    filters: {
      language: languageParam,
      resolvedLanguage,
      originalLanguage,
      format: formatFilter,
      dedupedByPosition: true,
    },
    pagination: {
      limit,
      offset,
      returned: page.length,
      total: totalFiltered,
    },
  };
}

// ---------------------------------------------------------------------------
// Book formats (editions) — called directly, not via provider registry
// ---------------------------------------------------------------------------

const BOOK_FORMATS_FETCH_CAP = 200;

export type HardcoverNormalizedBookFormat = {
  editionId: number;
  title: string | null;
  /** Normalized: ebook | audiobook | hardcover | paperback | null */
  format: SeriesFormatFilter | null;
  formatLabel: string | null;
  editionFormat: string | null;
  readingFormat: string | null;
  language: string | null;
  languageCode: string | null;
  country: string | null;
  countryCode: string | null;
  isbn: string | null;
  isbn10: string | null;
  asin: string | null;
  pages: number | null;
  publicationDate: string | null;
  publisher: string | null;
  cover: string;
  usersCount: number | null;
};

export type HardcoverNormalizedBookFormats = {
  scrapedURL: string;
  book: {
    id: string;
    slug: string;
    title: string;
  };
  formats: HardcoverNormalizedBookFormat[];
  filters: {
    language: string | null;
    resolvedLanguage: string | null;
    originalLanguage: string | null;
    format: SeriesFormatFilter | null;
  };
  availableLanguages: Array<{ code: string; name: string }>;
  availableFormats: SeriesFormatFilter[];
  totalEditions: number;
  totalMatched: number;
};

type HardcoverFormatsEdition = {
  id?: number | null;
  title?: string | null;
  edition_format?: string | null;
  physical_format?: string | null;
  isbn_10?: string | null;
  isbn_13?: string | null;
  asin?: string | null;
  pages?: number | null;
  release_date?: string | null;
  users_count?: number | null;
  language?: HardcoverLanguage;
  country?: HardcoverCountry;
  reading_format?: {
    id?: number | null;
    format?: string | null;
  } | null;
  publisher?: {
    name?: string | null;
  } | null;
  image?: HardcoverImage;
};

type HardcoverFormatsBook = {
  id: number;
  slug: string;
  title: string;
  editions_count?: number | null;
  editions?: HardcoverFormatsEdition[] | null;
};

/**
 * List editions/formats for a book with optional language and format filters.
 * Does not go through the multi-provider registry — Hardcover only.
 */
export async function fetchHardcoverBookFormats(
  slugOrId: string,
  options: {
    limit?: number;
    language?: string | null;
    format?: string | null;
  } = {}
): Promise<HardcoverNormalizedBookFormats> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const languageRaw =
    options.language === undefined || options.language === null
      ? null
      : options.language.trim() === ""
        ? null
        : options.language;
  // null = no language filter; "original" = majority language; "es" = code
  const languageParam =
    languageRaw === null ? null : normalizeLanguageParam(languageRaw);
  const formatFilter = normalizeFormatParam(options.format ?? null);
  const numericId = /^\d+$/.test(slugOrId) ? Number(slugOrId) : null;

  const formatsSelection = `
    id
    slug
    title
    editions_count
    editions(limit: $fetchLimit, order_by: { users_count: desc }) {
      id
      title
      edition_format
      physical_format
      isbn_10
      isbn_13
      asin
      pages
      release_date
      users_count
      language {
        code2
        language
      }
      country {
        name
        code2
      }
      reading_format {
        id
        format
      }
      publisher {
        name
      }
      image {
        url
        width
        height
      }
    }
  `;

  const formatsQuery =
    numericId !== null
      ? `
      query GetBookFormatsById($numericId: Int!, $fetchLimit: Int!) {
        books(where: { id: { _eq: $numericId } }, limit: 1) {
          ${formatsSelection}
        }
      }
    `
      : `
      query GetBookFormatsBySlug($slug: String!, $fetchLimit: Int!) {
        books(where: { slug: { _eq: $slug } }, limit: 1) {
          ${formatsSelection}
        }
      }
    `;

  const data = await hardcoverGraphQLRequest<{ books?: HardcoverFormatsBook[] }>(
    formatsQuery,
    numericId !== null
      ? { numericId, fetchLimit: BOOK_FORMATS_FETCH_CAP }
      : { slug: slugOrId, fetchLimit: BOOK_FORMATS_FETCH_CAP }
  );

  const book = Array.isArray(data.books) ? data.books[0] : null;
  if (!book) {
    throw new Error(`No Hardcover book found for slug "${slugOrId}"`);
  }

  const rawEditions = Array.isArray(book.editions) ? book.editions : [];
  const totalEditions =
    typeof book.editions_count === "number" && Number.isFinite(book.editions_count)
      ? book.editions_count
      : rawEditions.length;

  const languageCounts = new Map<string, { count: number; name: string }>();
  const formatSet = new Set<SeriesFormatFilter>();

  type InternalFormat = HardcoverNormalizedBookFormat & {
    _score: number;
  };

  const all: InternalFormat[] = [];

  for (const edition of rawEditions) {
    if (typeof edition?.id !== "number") {
      continue;
    }

    const { language: languageName, languageCode } = languageFromEdition(
      edition.language
    );
    if (languageCode) {
      const existing = languageCounts.get(languageCode);
      languageCounts.set(languageCode, {
        count: (existing?.count ?? 0) + 1,
        name: languageName || existing?.name || languageCode,
      });
    }

    const { country, countryCode } = countryFromEdition(edition.country);

    const editionFormat =
      trimToNull(edition.edition_format) || trimToNull(edition.physical_format);
    const readingFormat = trimToNull(edition.reading_format?.format);
    const normalizedFormat = normalizeFormatLabel(editionFormat, readingFormat);
    if (normalizedFormat) {
      formatSet.add(normalizedFormat);
    }

    const formatLabel = editionFormat || readingFormat;
    const usersCount =
      typeof edition.users_count === "number" && Number.isFinite(edition.users_count)
        ? edition.users_count
        : null;

    all.push({
      editionId: edition.id,
      title: trimToNull(edition.title),
      format: normalizedFormat,
      formatLabel,
      editionFormat,
      readingFormat,
      language: languageName,
      languageCode,
      country,
      countryCode,
      isbn: trimToNull(edition.isbn_13),
      isbn10: trimToNull(edition.isbn_10),
      asin: trimToNull(edition.asin),
      pages: typeof edition.pages === "number" ? edition.pages : null,
      publicationDate: trimToNull(edition.release_date),
      publisher: trimToNull(edition.publisher?.name),
      cover: toCoverUrl(edition.image || null),
      usersCount,
      _score: usersCount ?? 0,
    });
  }

  // Infer original language as the most common language among editions.
  let originalLanguage: string | null = null;
  let bestLangCount = -1;
  for (const [code, meta] of languageCounts) {
    if (meta.count > bestLangCount) {
      originalLanguage = code;
      bestLangCount = meta.count;
    }
  }

  const resolvedLanguage =
    languageParam === null
      ? null
      : languageParam === "original"
        ? originalLanguage
        : languageParam;

  const matched = all
    .filter((entry) => {
      if (resolvedLanguage) {
        if (entry.languageCode !== resolvedLanguage) {
          return false;
        }
      }
      if (!formatMatchesFilter(entry.format, formatFilter)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score: _ignored, ...rest }) => rest);

  const availableLanguages = Array.from(languageCounts.entries())
    .map(([code, meta]) => ({ code, name: meta.name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const availableFormats = Array.from(formatSet).sort();

  return {
    scrapedURL: `https://hardcover.app/books/${book.slug}`,
    book: {
      id: String(book.id),
      slug: book.slug,
      title: book.title,
    },
    formats: matched,
    filters: {
      language: languageParam,
      resolvedLanguage,
      originalLanguage,
      format: formatFilter,
    },
    availableLanguages,
    availableFormats,
    totalEditions,
    totalMatched: matched.length,
  };
}
