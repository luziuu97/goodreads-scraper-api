import {
  getBookCoversApiParameters,
  getBookCoversApiResponse,
  getBookCoversCodeSnippets,
} from "@/data/api-endpoint/get-book-covers";
import {
  getBookDetailsApiParameters,
  getBookDetailsApiResponse,
  getBookDetailsCodeSnippets,
} from "@/data/api-endpoint/get-book-details";
import {
  getBookFormatsApiParameters,
  getBookFormatsApiResponse,
  getBookFormatsCodeSnippets,
} from "@/data/api-endpoint/get-book-formats";
import {
  getSeriesDetailsApiParameters,
  getSeriesDetailsApiResponse,
  getSeriesDetailsCodeSnippets,
} from "@/data/api-endpoint/get-series-details";
import {
  searchBooksApiParameters,
  searchBooksApiResponse,
  searchBooksCodeSnippets,
} from "@/data/api-endpoint/search-books";
import {
  searchSeriesApiParameters,
  searchSeriesApiResponse,
  searchSeriesCodeSnippets,
} from "@/data/api-endpoint/search-series";

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  placeholder?: string;
  options?: string[];
}

export interface CodeSnippets {
  javascript: string;
  typescript: string;
  python: string;
  nodejs: string;
}

export interface Endpoint {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  route: string;
  parameters: Parameter[];
  exampleResponse: any;
  codeSnippets: CodeSnippets;
}

export type ApiEndPointID =
  | "get_book_details"
  | "get_book_covers"
  | "get_book_formats"
  | "search_books"
  | "batch_search_books"
  | "search_series"
  | "get_series_details";

export const endpoints: Endpoint[] = [
  {
    id: "get-book-details",
    name: "Get Book Details",
    description:
      "Retrieve detailed information about a specific book from structured metadata providers (default: aggregate; currently Hardcover).",
    method: "GET",
    url: "/api/book/details/:slug",
    route: "/api/book/details",
    parameters: getBookDetailsApiParameters,
    exampleResponse: getBookDetailsApiResponse,
    codeSnippets: getBookDetailsCodeSnippets,
  },
  {
    id: "get-book-covers",
    name: "Get Book Covers",
    description:
      "List edition covers for a book with image metadata (width, height, color) so clients can pick the best resolution.",
    method: "GET",
    url: "/api/book/covers/:slug",
    route: "/api/book/covers",
    parameters: getBookCoversApiParameters,
    exampleResponse: getBookCoversApiResponse,
    codeSnippets: getBookCoversCodeSnippets,
  },
  {
    id: "get-book-formats",
    name: "Get Book Formats",
    description:
      "List editions/formats for a book (Hardcover). Filter by language and/or format. No provider parameter.",
    method: "GET",
    url: "/api/book/formats/:slug",
    route: "/api/book/formats",
    parameters: getBookFormatsApiParameters,
    exampleResponse: getBookFormatsApiResponse,
    codeSnippets: getBookFormatsCodeSnippets,
  },
  {
    id: "search-books",
    name: "Search Books",
    description:
      "Search for books by title, author, or ISBN. Omit provider to use aggregate multi-source mode (currently Hardcover).",
    method: "GET",
    url: "/api/book/search",
    route: "/api/book/search",
    parameters: searchBooksApiParameters,
    exampleResponse: searchBooksApiResponse,
    codeSnippets: searchBooksCodeSnippets,
  },
  {
    id: "search-series",
    name: "Search Series",
    description:
      "Search for book series by name. Returns series-shaped results (not books).",
    method: "GET",
    url: "/api/series/search",
    route: "/api/series/search",
    parameters: searchSeriesApiParameters,
    exampleResponse: searchSeriesApiResponse,
    codeSnippets: searchSeriesCodeSnippets,
  },
  {
    id: "get-series-details",
    name: "Get Series Details",
    description:
      "Retrieve a series and its ordered books (paginated with limit/offset).",
    method: "GET",
    url: "/api/series/:slug",
    route: "/api/series",
    parameters: getSeriesDetailsApiParameters,
    exampleResponse: getSeriesDetailsApiResponse,
    codeSnippets: getSeriesDetailsCodeSnippets,
  },
];
