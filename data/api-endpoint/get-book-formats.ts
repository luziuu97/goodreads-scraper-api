import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const getBookFormatsApiParameters: Parameter[] = [
  {
    name: "slug",
    type: "string",
    required: true,
    description: "Hardcover book id or slug",
    placeholder: "fourth-wing",
  },
  {
    name: "language",
    type: "string",
    required: false,
    description:
      'ISO language code (en, es, …), "original" for the majority language, or omit for all languages.',
    placeholder: "en",
  },
  {
    name: "format",
    type: "select",
    required: false,
    description:
      "Optional format filter. physical = hardcover or paperback; or pick hardcover / paperback specifically.",
    options: ["ebook", "audiobook", "hardcover", "paperback", "physical"],
  },
  {
    name: "limit",
    type: "number",
    required: false,
    description: "Max editions to return after filtering (default: 50, max: 100)",
    placeholder: "50",
  },
];

export const getBookFormatsApiResponse = {
  success: true,
  scrapedURL: "https://hardcover.app/books/fourth-wing",
  book: {
    id: "714600",
    slug: "fourth-wing",
    title: "Fourth Wing",
  },
  formats: [
    {
      editionId: 31440211,
      title: "Fourth Wing",
      format: "ebook",
      formatLabel: "Kindle",
      editionFormat: "Kindle",
      readingFormat: "Ebook",
      language: "English",
      languageCode: "en",
      country: "United States of America",
      countryCode: "us",
      isbn: null,
      isbn10: null,
      asin: "B0BGHCXCYB",
      pages: 517,
      publicationDate: "2023-05-02",
      publisher: "Red Tower Books",
      cover: "https://assets.hardcover.app/...",
      usersCount: 12000,
    },
  ],
  filters: {
    language: "en",
    resolvedLanguage: "en",
    originalLanguage: "en",
    format: "ebook",
  },
  availableLanguages: [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
  ],
  availableFormats: ["audiobook", "ebook", "hardcover", "paperback"],
  totalEditions: 78,
  totalMatched: 1,
};

export const getBookFormatsCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
