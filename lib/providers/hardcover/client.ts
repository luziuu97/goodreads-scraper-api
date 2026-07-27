import { API_CONFIG, getHardcoverApiToken } from "@/lib/api-config";

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
  author_names?: string[];
  rating?: number;
  release_date?: string;
  genres?: string[];
  image?: HardcoverImage;
};

type HardcoverSearchHit = {
  document?: HardcoverSearchResult | null;
};

type HardcoverSearchResults = {
  found?: number | null;
  hits?: HardcoverSearchHit[] | null;
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
  publisher?: {
    name?: string | null;
  } | null;
  book?: {
    id?: number | null;
    slug?: string | null;
    title?: string | null;
    rating?: number | null;
    release_date?: string | null;
    cached_tags?: Record<string, Array<{ tag?: string | null }>> | null;
    contributions?: Array<{
      author?: {
        id?: number | null;
        name?: string | null;
        slug?: string | null;
      } | null;
    }> | null;
  } | null;
};

type HardcoverDetailsBook = {
  id: number;
  slug: string;
  title: string;
  subtitle?: string | null;
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
  contributions?: Array<{
    author?: {
      id?: number | null;
      name?: string | null;
      slug?: string | null;
    } | null;
  }> | null;
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
  publisher?: {
    name?: string | null;
  } | null;
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
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string;
  genres?: string[];
  edition?: HardcoverNormalizedEdition;
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
  publisher: string | null;
  cover: string;
};

export type HardcoverNormalizedBookDetails = {
  scrapedURL: string;
  book: {
    cover: string;
    series: string;
    seriesURL: string;
    pages: number | null;
    slug: string;
    title: string;
    author: Array<{ id: number; name: string; url: string }>;
    translator: null;
    illustrators: unknown[];
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
    language: null;
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
    throw new Error("HARDCOVER_API_TOKEN is required to use provider=hardcover");
  }

  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": API_CONFIG.userAgent,
      authorization: normalizeAuthorizationToken(token),
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await response.json()) as GraphQLResponse<T>;

  if (!response.ok) {
    const message =
      json.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      `Hardcover request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (json.errors && json.errors.length > 0) {
    const message = json.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Hardcover GraphQL request failed");
  }

  if (!json.data) {
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

function toCoverUrl(image: HardcoverImage | HardcoverDetailsBook["image"]): string {
  if (!image) return "";
  if (Array.isArray(image)) {
    return image.find((entry) => typeof entry?.url === "string" && entry.url)?.url || "";
  }
  return typeof image.url === "string" ? image.url : "";
}

function mapHardcoverAuthors(book: HardcoverDetailsBook): Array<{ id: number; name: string; url: string }> {
  const contributionAuthors =
    book.contributions
      ?.map((contribution) => contribution.author)
      .filter((author): author is NonNullable<typeof author> => Boolean(author?.name))
      .map((author, index) => ({
        id: typeof author.id === "number" ? author.id : index + 1,
        name: author.name?.trim() || "",
        url: author.slug ? `https://hardcover.app/authors/${author.slug}` : "",
      }))
      .filter((author) => author.name) || [];

  if (contributionAuthors.length > 0) {
    return contributionAuthors;
  }

  return [];
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

function normalizeEdition(
  edition: HardcoverEditionSearchResult | HardcoverEditionDetails | null | undefined
): HardcoverNormalizedEdition | undefined {
  if (typeof edition?.id !== "number") {
    return undefined;
  }

  return {
    id: edition.id,
    title: trimToNull(edition.title) || undefined,
    isbn: trimToNull(edition.isbn_13),
    isbn10: trimToNull(edition.isbn_10),
    asin: trimToNull(edition.asin),
    format: trimToNull(edition.edition_format),
    publicationDate: trimToNull(edition.release_date),
    pages: typeof edition.pages === "number" ? edition.pages : null,
    publisher: trimToNull(edition.publisher?.name),
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

function editionSelection(includeBook = false, includeImageMeta = false): string {
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
    isbn_10
    isbn_13
    asin
    image {
      ${imageFields}
    }
    publisher {
      name
    }
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

async function searchHardcoverBooksByIsbn(
  normalizedIsbn: string,
  limit: number
): Promise<{ totalResults: number; books: HardcoverNormalizedSearchBook[] }> {
  const fieldName = normalizedIsbn.length === 10 ? "isbn_10" : "isbn_13";
  const isbnQuery = `
    query SearchBooksByIsbn($isbn: String!, $limit: Int!) {
      editions(where: { ${fieldName}: { _eq: $isbn } }, limit: $limit) {
        ${editionSelection()}
        book {
          id
          slug
          title
          rating
          release_date
          cached_tags
          contributions {
            author {
              id
              name
              slug
            }
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
      const title =
        (typeof linkedBook?.title === "string" && linkedBook.title.trim()) ||
        (typeof edition.title === "string" && edition.title.trim()) ||
        "";
      if (!title) {
        return null;
      }

      const authors =
        linkedBook?.contributions
          ?.map((contribution) => contribution.author?.name?.trim() || "")
          .filter(Boolean) || [];

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
        author: authors.join(", "),
        cover: toCoverUrl(edition.image),
        rating:
          typeof linkedBook?.rating === "number" && Number.isFinite(linkedBook.rating)
            ? linkedBook.rating
            : typeof edition.rating === "number" && Number.isFinite(edition.rating)
              ? edition.rating
              : undefined,
        publicationDate:
          (typeof linkedBook?.release_date === "string" && linkedBook.release_date.trim()) ||
          (typeof edition.release_date === "string" && edition.release_date.trim()) ||
          undefined,
        genres: getEditionGenres(linkedBook?.cached_tags ?? null),
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

  if (effectiveType === "isbn") {
    return searchHardcoverBooksByIsbn(effectiveQuery, input.limit);
  }

  const data = await hardcoverGraphQLRequest<{
    search: {
      results?: HardcoverSearchResults | null;
    };
  }>(searchQuery, {
    query: effectiveQuery,
    perPage: input.limit,
    page: 1,
    fields: broadFields,
    weights: broadWeights,
  });

  const rawHits = Array.isArray(data.search?.results?.hits) ? data.search.results.hits : [];
  const books = rawHits
    .map((hit): HardcoverNormalizedSearchBook | null => {
      const result = hit.document;
      const title = typeof result?.title === "string" ? result.title.trim() : "";
      if (!title) {
        return null;
      }

      const authorNames = toStringArray(result?.author_names);
      const genres = toStringArray(result?.genres);
      const id =
        typeof result?.id === "number" || typeof result?.id === "string"
          ? String(result.id)
          : typeof result?.slug === "string" && result.slug
            ? result.slug
            : title;

      return {
        id,
        title,
        author: authorNames.join(", "),
        cover: toCoverUrl(result?.image || null),
        rating: toNumber(result?.rating),
        publicationDate:
          typeof result?.release_date === "string" && result.release_date.trim()
            ? result.release_date
            : undefined,
        genres: genres.length > 0 ? genres : undefined,
      };
    })
    .filter((book): book is HardcoverNormalizedSearchBook => Boolean(book));

  return {
    totalResults:
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
  const numericId = /^\d+$/.test(slugOrId) ? Number(slugOrId) : null;
  const detailsSelection = `
    id
    slug
    title
    subtitle
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
      author {
        id
        name
        slug
      }
    }
    image {
      url
    }
    default_cover_edition {
      ${editionSelection()}
    }
  `;

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

  const authors = mapHardcoverAuthors(book);
  const series = getSeriesLabel(book);
  const seriesURL = getSeriesUrl(book);
  let edition: HardcoverEditionDetails | null | undefined = book.default_cover_edition;

  if (typeof options.editionId === "number") {
    const editionData = await hardcoverGraphQLRequest<{ editions?: HardcoverEditionDetails[] }>(
      `
        query GetEditionDetailsById($editionId: Int!) {
          editions(where: { id: { _eq: $editionId } }, limit: 1) {
            ${editionSelection(true)}
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

  const rating =
    typeof book.rating === "number" && Number.isFinite(book.rating)
      ? book.rating.toFixed(2)
      : "";

  return {
    scrapedURL: `https://hardcover.app/books/${book.slug}`,
    book: {
      cover: toCoverUrl(edition?.image || null) || toCoverUrl(book.image),
      series,
      seriesURL,
      pages: typeof edition?.pages === "number" ? edition.pages : null,
      slug: book.slug,
      title: book.title,
      author: authors,
      translator: null,
      illustrators: [],
      rating,
      ratingCount:
        typeof book.ratings_count === "number" ? String(book.ratings_count) : "",
      reviewsCount:
        typeof book.reviews_count === "number" ? String(book.reviews_count) : "",
      description: typeof book.description === "string" ? book.description : "",
      genres: getEditionGenres(book.cached_tags ?? null) || [],
      bookEdition: trimToNull(edition?.edition_format),
      publishDate:
        trimToNull(edition?.release_date) || trimToNull(book.release_date),
      isbn: trimToNull(edition?.isbn_13),
      isbn10: trimToNull(edition?.isbn_10),
      asin: trimToNull(edition?.asin),
      language: null,
      publishedBy: trimToNull(edition?.publisher?.name),
      type: trimToNull(edition?.edition_format),
      edition: normalizeEdition(edition) || null,
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
  language?: {
    language?: string | null;
    code2?: string | null;
  } | null;
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
      language: trimToNull(edition.language?.language),
      languageCode: trimToNull(edition.language?.code2),
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
      contributions?: Array<{
        author?: {
          id?: number | null;
          name?: string | null;
          slug?: string | null;
        } | null;
      }> | null;
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

  const authors =
    book?.contributions
      ?.map((contribution) => contribution.author?.name?.trim() || "")
      .filter(Boolean) || [];

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
          author {
            id
            name
            slug
          }
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
  language?: {
    code2?: string | null;
    language?: string | null;
  } | null;
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

    const languageCode =
      typeof edition.language?.code2 === "string"
        ? edition.language.code2.trim().toLowerCase()
        : null;
    const languageName = trimToNull(edition.language?.language);
    if (languageCode) {
      const existing = languageCounts.get(languageCode);
      languageCounts.set(languageCode, {
        count: (existing?.count ?? 0) + 1,
        name: languageName || existing?.name || languageCode,
      });
    }

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
