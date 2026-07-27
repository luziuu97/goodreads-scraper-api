import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const getSeriesDetailsApiParameters: Parameter[] = [
  {
    name: "slug",
    type: "string",
    required: true,
    description: "Provider-specific series identifier or slug (Hardcover id or slug)",
    placeholder: "the-empyrean",
  },
  {
    name: "provider",
    type: "select",
    required: false,
    description:
      "Book data source. Omit or use aggregate for multi-source default (currently Hardcover). Explicit hardcover pins to that provider.",
    options: ["aggregate", "hardcover"],
  },
  {
    name: "limit",
    type: "number",
    required: false,
    description: "Max books to return from the series list (default: 50, max: 100)",
    placeholder: "50",
  },
  {
    name: "offset",
    type: "number",
    required: false,
    description: "Offset into the ordered series book list (default: 0)",
    placeholder: "0",
  },
  {
    name: "language",
    type: "string",
    required: false,
    description:
      'ISO language code (en, es, …) or "original" (default). Original picks the series majority/original language and one book per position.',
    placeholder: "original",
  },
  {
    name: "format",
    type: "select",
    required: false,
    description:
      "Optional format filter. physical = hardcover or paperback; or pick hardcover / paperback specifically.",
    options: ["ebook", "audiobook", "hardcover", "paperback", "physical"],
  },
];

export const getSeriesDetailsApiResponse = {
  success: true,
  provider: "aggregate",
  scrapedURL: "https://hardcover.app/series/the-empyrean",
  series: {
    id: "41764",
    slug: "the-empyrean",
    name: "The Empyrean",
    description: null,
    booksCount: 12,
    primaryBooksCount: 3,
    isCompleted: false,
    author: {
      id: 252677,
      name: "Rebecca Yarros",
      url: "https://hardcover.app/authors/rebecca-yarros",
    },
    provider: "hardcover",
  },
  books: [
    {
      id: "714600",
      slug: "fourth-wing",
      title: "Fourth Wing",
      author: "Rebecca Yarros",
      cover: "https://assets.hardcover.app/covers/fourth-wing.jpg",
      rating: 4.58,
      publicationDate: "2023-05-02",
      position: 1,
      positionLabel: "1",
      featured: true,
      compilation: false,
      languageCode: "en",
      language: "English",
      format: "hardcover",
      formatLabel: "Hardcover",
    },
    {
      id: "714601",
      slug: "iron-flame",
      title: "Iron Flame",
      author: "Rebecca Yarros",
      cover: "https://assets.hardcover.app/covers/iron-flame.jpg",
      rating: 4.5,
      publicationDate: "2023-11-07",
      position: 2,
      positionLabel: "2",
      featured: true,
      compilation: false,
      languageCode: "en",
      language: "English",
      format: "ebook",
      formatLabel: "Ebook",
    },
  ],
  filters: {
    language: "original",
    resolvedLanguage: "en",
    originalLanguage: "en",
    format: null,
    dedupedByPosition: true,
  },
  pagination: {
    limit: 50,
    offset: 0,
    returned: 2,
    total: 12,
  },
};

export const getSeriesDetailsCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
