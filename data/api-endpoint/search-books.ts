import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const searchBooksApiParameters: Parameter[] = [
  {
    name: "query",
    type: "string",
    required: true,
    description:
      "Search query (title, author, or ISBN). Translated titles like \"Juego de Tronos\" match the work and may return Spanish presentation metadata.",
    placeholder: "Juego de Tronos",
  },
  {
    name: "type",
    type: "select",
    required: false,
    description: "Type of search to perform",
    options: ["all", "title", "author", "isbn"],
  },
  {
    name: "language",
    type: "string",
    required: false,
    description:
      "Optional ISO language filter (en, es, …). Results must have an edition in that language, which supplies title, cover, and translator metadata.",
    placeholder: "es",
  },
  {
    name: "provider",
    type: "select",
    required: false,
    description:
      "Book data source. Omit or use aggregate for multi-source default (Hardcover, ISBNDB, OpenLibrary). Explicit provider pins to that source.",
    options: ["aggregate", "hardcover", "isbndb", "openlibrary"],
  },
  {
    name: "limit",
    type: "number",
    required: false,
    description: "Number of results to return (default: 10, max: 50)",
    placeholder: "20",
  },
];

export const searchBooksApiResponse = {
  success: true,
  provider: "aggregate",
  results: {
    query: "Juego de Tronos",
    totalResults: 1,
    books: [
      {
        id: "644",
        provider: "hardcover",
        title: "Juego de Tronos",
        workTitle: "A Game of Thrones",
        author: "George R.R. Martin",
        cover: "https://assets.hardcover.app/edition/30566523/...",
        rating: 4.45,
        publicationDate: "1996-01-01",
        language: "Spanish; Castilian",
        languageCode: "es",
        translators: ["Cristina Macía"],
        presentation: "edition",
        genres: ["Fantasy"],
        isbn: "9788496208926",
        edition: {
          id: 15086528,
          title: "Juego de tronos",
          isbn: "9788496208926",
          language: "Spanish; Castilian",
          languageCode: "es",
          country: "Spain",
          countryCode: "es",
          publisher: "Gigamesh, S.L.",
          pages: 790,
        },
      },
    ],
  },
};

export const searchBooksCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
