import {
  getBookDetailsApiParameters,
  getBookDetailsApiResponse,
  getBookDetailsCodeSnippets,
} from "@/data/api-endpoint/get-book-details";
import {
  searchBooksApiParameters,
  searchBooksApiResponse,
  searchBooksCodeSnippets,
} from "@/data/api-endpoint/search-books";

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

export type ApiEndPointID = "get_book_details" | "search_books";

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
];
