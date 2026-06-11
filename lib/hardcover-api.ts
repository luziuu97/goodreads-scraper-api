import { API_CONFIG, getHardcoverApiToken } from "@/lib/api-config";

const HARDCOVER_GRAPHQL_URL = "https://api.hardcover.app/v1/graphql";

type HardcoverSearchResult = {
  id?: number | string;
  slug?: string;
  title?: string;
  author_names?: string[];
  rating?: number;
  release_date?: string;
  genres?: string[];
  image?: {
    url?: string;
  } | null;
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
  title?: string | null;
  release_date?: string | null;
  rating?: number | null;
  edition_format?: string | null;
  image?: {
    url?: string | null;
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
  default_cover_edition?: {
    pages?: number | null;
    edition_format?: string | null;
    isbn_10?: string | null;
    isbn_13?: string | null;
    asin?: string | null;
    publisher?: {
      name?: string | null;
    } | null;
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

function toCoverUrl(image: HardcoverSearchResult["image"] | HardcoverDetailsBook["image"]): string {
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
        id
        isbn_10
        isbn_13
        title
        release_date
        rating
        edition_format
        image {
          url
        }
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
        genres: getEditionGenres(linkedBook?.cached_tags),
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
  slugOrId: string
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
      pages
      edition_format
      isbn_10
      isbn_13
      asin
      publisher {
        name
      }
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
  const edition = book.default_cover_edition;
  const rating =
    typeof book.rating === "number" && Number.isFinite(book.rating)
      ? book.rating.toFixed(2)
      : "";

  return {
    scrapedURL: `https://hardcover.app/books/${book.slug}`,
    book: {
      cover: toCoverUrl(book.image),
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
      genres: getEditionGenres(book.cached_tags) || [],
      bookEdition: edition?.edition_format?.trim() || null,
      publishDate:
        typeof book.release_date === "string" && book.release_date.trim()
          ? book.release_date
          : null,
      isbn: edition?.isbn_13?.trim() || null,
      isbn10: edition?.isbn_10?.trim() || null,
      asin: edition?.asin?.trim() || null,
      language: null,
      publishedBy: edition?.publisher?.name?.trim() || null,
      type: edition?.edition_format?.trim() || null,
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
