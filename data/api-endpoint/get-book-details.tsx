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
  scrapedURL: "canonical://work/62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
  book: {
    id: "62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
    slug: "the-alchemist",
    title: "The Alchemist",
    canonicalTitle: "The Alchemist",
    description:
      "Combining magic, mysticism, wisdom, and wonder into an inspiring tale of self-discovery.",
    language: "en",
    languageCode: "en",
    author: "Paulo Coelho",
    authors: [{ id: "author-1", name: "Paulo Coelho", role: "AUTHOR" }],
    translators: [],
    illustrators: [],
    narrators: [],
    editors: [],
    rating: 3.92,
    ratingsCount: 3363456,
    publicationYear: 1988,
    publicationDate: "1988-01-01",
    publisher: "HarperOne",
    pages: 182,
    genres: ["Fiction", "Fantasy", "Philosophy"],
    matchedEdition: {
      id: "edition-1",
      workId: "62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
      title: "The Alchemist",
      format: "paperback",
      language: "en",
      isbn13: "9780062315007",
      isbn10: "0062315005",
      asin: null,
      publisher: "HarperOne",
      publicationDate: "1988-01-01",
      pages: 182,
      isDefault: true,
      cover: "https://assets.hardcover.app/covers/the-alchemist.jpg",
      covers: [
        {
          id: "cover-1",
          editionId: "edition-1",
          provider: "hardcover",
          url: "https://assets.hardcover.app/covers/the-alchemist.jpg",
          width: 400,
          height: 600,
          pixelCount: 240000,
          imageFormat: "jpeg",
          isDefault: true,
        },
      ],
      providerMappings: [
        {
          id: "map-1",
          provider: "hardcover",
          providerWorkId: "1662524",
          providerEditionId: null,
          workId: "62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
          editionId: "edition-1",
        },
      ],
    },
    editions: [],
    translations: [
      {
        id: "trans-en",
        workId: "62d7fb9a-bc87-4eb7-a9bb-6df729d67d25",
        language: "en",
        title: "The Alchemist",
        description:
          "Combining magic, mysticism, wisdom, and wonder into an inspiring tale of self-discovery.",
      },
    ],
    series: [],
  },
};

export const getBookDetailsCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
