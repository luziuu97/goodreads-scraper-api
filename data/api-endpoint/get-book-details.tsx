import { CodeSnippets } from "@/lib/api-endpoints";

export const getBookDetailsApiParameters = [
  {
    name: "slug",
    type: "string",
    required: true,
    description: "Provider-specific book identifier or slug (Hardcover id or slug)",
    placeholder: "1662524",
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
    name: "editionId",
    type: "number",
    required: false,
    description:
      "Hardcover edition ID from ISBN search results. Use with provider=hardcover (or aggregate) to retrieve the exact matched edition.",
    placeholder: "456",
  },
];

export const getBookDetailsApiResponse = {
  success: true,
  provider: "aggregate",
  scrapedURL: "https://hardcover.app/books/the-alchemist",
  book: {
    provider: "hardcover",
    cover: "https://assets.hardcover.app/covers/the-alchemist.jpg",
    series: "",
    seriesURL: "",
    pages: 182,
    slug: "the-alchemist",
    title: "The Alchemist",
    author: [
      {
        id: 1,
        name: "Paulo Coelho",
        url: "https://hardcover.app/authors/paulo-coelho",
      },
    ],
    translator: null,
    translators: [],
    illustrators: [],
    narrators: [],
    editors: [],
    otherContributors: [],
    rating: "3.92",
    ratingCount: "3363456",
    reviewsCount: "135508",
    description:
      "Combining magic, mysticism, wisdom, and wonder into an inspiring tale of self-discovery.",
    genres: ["Fiction", "Fantasy", "Philosophy"],
    bookEdition: "Paperback",
    publishDate: "1988-01-01",
    isbn: "9780062315007",
    isbn10: "0062315005",
    asin: null,
    language: "English",
    languageCode: "en",
    country: "United States of America",
    countryCode: "us",
    publishedBy: "HarperOne",
    type: "Paperback",
    edition: {
      id: 12345,
      title: "The Alchemist",
      isbn: "9780062315007",
      isbn10: "0062315005",
      asin: null,
      format: "Paperback",
      publicationDate: "1988-01-01",
      pages: 182,
      publisher: "HarperOne",
      language: "English",
      languageCode: "en",
      country: "United States of America",
      countryCode: "us",
      cover: "https://assets.hardcover.app/covers/the-alchemist.jpg",
    },
    related: [],
    lastScraped: "2026-07-21T00:00:00.000Z",
  },
};

export const getBookDetailsCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
