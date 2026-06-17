import { parseBookDetailsHtml, scrapeBookDetails } from "@/lib/goodreads-book-details";
import {
  fetchHardcoverBookDetails,
  searchHardcoverBooks,
  type HardcoverNormalizedBookDetails,
  type HardcoverNormalizedSearchBook,
} from "@/lib/hardcover-api";

export type BookProvider = "goodreads" | "hardcover";

export type NormalizedSearchBook = {
  id: string;
  provider: BookProvider;
  title: string;
  author: string;
  cover: string;
  rating?: number;
  publicationDate?: string;
  genres?: string[];
  edition?: {
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
};

export type NormalizedSearchResponse = {
  success: true;
  provider: BookProvider;
  results: {
    query: string;
    totalResults: number;
    books: NormalizedSearchBook[];
  };
};

export type NormalizedBookDetailsResponse = {
  success: true;
  provider: BookProvider;
  scrapedURL: string;
  book: Record<string, unknown>;
};

function mapHardcoverSearchBook(book: HardcoverNormalizedSearchBook): NormalizedSearchBook {
  return {
    id: book.id,
    provider: "hardcover",
    title: book.title,
    author: book.author,
    cover: book.cover,
    rating: book.rating,
    publicationDate: book.publicationDate,
    genres: book.genres,
    edition: book.edition,
  };
}

function mapHardcoverBookDetails(
  details: HardcoverNormalizedBookDetails
): NormalizedBookDetailsResponse {
  return {
    success: true,
    provider: "hardcover",
    scrapedURL: details.scrapedURL,
    book: {
      ...details.book,
      provider: "hardcover",
    },
  };
}

export function parseProvider(value: string | null): BookProvider {
  if (!value || value.trim() === "") {
    return "goodreads";
  }

  if (value === "goodreads" || value === "hardcover") {
    return value;
  }

  throw new Error("Invalid provider parameter. Valid options: goodreads, hardcover");
}

export async function searchBooksByProvider(input: {
  provider: BookProvider;
  query: string;
  limit: number;
  type: string;
  goodreadsSearch?: () => Promise<NormalizedSearchResponse>;
}): Promise<NormalizedSearchResponse> {
  const { provider, query, limit, type, goodreadsSearch } = input;

  if (provider === "goodreads") {
    if (!goodreadsSearch) {
      throw new Error("Goodreads search handler is required");
    }
    return goodreadsSearch();
  }

  const hardcoverResults = await searchHardcoverBooks({ query, limit, type });
  return {
    success: true,
    provider: "hardcover",
    results: {
      query,
      totalResults: hardcoverResults.totalResults,
      books: hardcoverResults.books.map(mapHardcoverSearchBook),
    },
  };
}

export async function getBookDetailsByProvider(input: {
  provider: BookProvider;
  slug: string;
  includeReviews: boolean;
  editionId?: number;
}): Promise<NormalizedBookDetailsResponse> {
  const { provider, slug, includeReviews, editionId } = input;

  if (provider === "goodreads") {
    const { scrapedURL, book } = await scrapeBookDetails(slug, includeReviews);
    return {
      success: true,
      provider: "goodreads",
      scrapedURL,
      book: {
        ...book,
        provider: "goodreads",
      },
    };
  }

  if (includeReviews) {
    throw new Error("The reviews=true option is only supported for provider=goodreads");
  }

  const hardcoverDetails = await fetchHardcoverBookDetails(slug, { editionId });
  return mapHardcoverBookDetails(hardcoverDetails);
}

export function buildSingleGoodreadsBookSearchResponse(
  query: string,
  htmlString: string,
  finalUrl: string
): NormalizedSearchResponse {
  const { book } = parseBookDetailsHtml(htmlString, finalUrl);
  const primaryAuthor =
    Array.isArray(book.author) && book.author.length > 0
      ? book.author[0]?.name || ""
      : "";

  return {
    success: true,
    provider: "goodreads",
    results: {
      query,
      totalResults: 1,
      books: [
        {
          id: book.slug.match(/^(\d+)/)?.[1] || "1",
          provider: "goodreads",
          title: book.title.trim(),
          author: primaryAuthor,
          cover: book.cover || "",
          rating: book.rating ? parseFloat(book.rating) : undefined,
          publicationDate: book.publishDate || undefined,
          genres: Array.isArray(book.genres) && book.genres.length > 0 ? book.genres : undefined,
        },
      ],
    },
  };
}
