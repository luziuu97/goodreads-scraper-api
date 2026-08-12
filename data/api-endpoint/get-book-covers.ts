import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const getBookCoversApiParameters: Parameter[] = [
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
    name: "limit",
    type: "number",
    required: false,
    description: "Max editions to fetch (default: 50, max: 100)",
    placeholder: "50",
  },
  {
    name: "onlyWithCover",
    type: "select",
    required: false,
    description:
      "When true (default), only return editions that have a cover image URL.",
    options: ["true", "false"],
  },
];

export const getBookCoversApiResponse = {
  success: true,
  provider: "aggregate",
  scrapedURL: "https://hardcover.app/books/fourth-wing",
  book: {
    id: "1662524",
    slug: "fourth-wing",
    title: "Fourth Wing",
    provider: "hardcover",
  },
  covers: [
    {
      editionId: 32963227,
      title: "Fourth Wing",
      url: "https://assets.hardcover.app/covers/fourth-wing.jpg",
      width: 1200,
      height: 1800,
      ratio: 0.6667,
      color: "#2a1f3d",
      pixelCount: 2160000,
      imageId: 98765,
      format: "hardcover",
      isbn: "9781649374042",
      isbn10: "1649374046",
      asin: null,
      publicationDate: "2023-05-02",
      pages: 517,
      publisher: "Red Tower Books",
      language: "English",
      languageCode: "en",
      country: "United States of America",
      countryCode: "us",
      isDefault: true,
    },
  ],
  bestByResolution: {
    editionId: 32963227,
    url: "https://assets.hardcover.app/covers/fourth-wing.jpg",
    width: 1200,
    height: 1800,
    pixelCount: 2160000,
  },
  totalCovers: 1,
  totalEditions: 24,
};

export const getBookCoversCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
