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
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
  };
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
      default_cover_edition?: {
        image?: HardcoverImage;
      } | null;
    } | null;
  }> | null;
};

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
  options: { limit?: number; offset?: number } = {}
): Promise<HardcoverNormalizedSeriesDetails> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const numericId = /^\d+$/.test(slugOrId) ? Number(slugOrId) : null;

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
    book_series(limit: $limit, offset: $offset, order_by: { position: asc }) {
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
          image {
            url
          }
        }
      }
    }
  `;

  const detailsQuery =
    numericId !== null
      ? `
      query GetSeriesDetailsById($numericId: Int!, $limit: Int!, $offset: Int!) {
        series(where: { id: { _eq: $numericId } }, limit: 1) {
          ${seriesSelection}
        }
      }
    `
      : `
      query GetSeriesDetailsBySlug($slug: String!, $limit: Int!, $offset: Int!) {
        series(where: { slug: { _eq: $slug } }, limit: 1) {
          ${seriesSelection}
        }
      }
    `;

  const data = await hardcoverGraphQLRequest<{ series?: HardcoverSeriesDetailsRow[] }>(
    detailsQuery,
    numericId !== null
      ? { numericId, limit, offset }
      : { slug: slugOrId, limit, offset }
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

  const books: HardcoverNormalizedSeriesBook[] = [];
  const rawEntries = Array.isArray(series.book_series) ? series.book_series : [];

  for (const entry of rawEntries) {
    const book = entry.book;
    const title = typeof book?.title === "string" ? book.title.trim() : "";
    if (!title) {
      continue;
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

    const cover =
      toCoverUrl(book?.image || null) ||
      toCoverUrl(book?.default_cover_edition?.image || null);

    books.push({
      id,
      slug: typeof book?.slug === "string" ? book.slug : id,
      title,
      author: authors.join(", ") || authorName,
      cover,
      rating: toNumber(book?.rating),
      publicationDate: trimToNull(book?.release_date),
      position:
        typeof entry.position === "number" && Number.isFinite(entry.position)
          ? entry.position
          : null,
      positionLabel: trimToNull(entry.details),
      featured: Boolean(entry.featured),
      compilation: Boolean(entry.compilation),
    });
  }

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
    books,
    pagination: {
      limit,
      offset,
      returned: books.length,
      total: booksCount,
    },
  };
}
