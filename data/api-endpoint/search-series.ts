import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const searchSeriesApiParameters: Parameter[] = [
  {
    name: "query",
    type: "string",
    required: true,
    description: "Search query (series name)",
    placeholder: "The Empyrean",
  },
  {
    name: "provider",
    type: "select",
    required: false,
    description:
      "Book data source. Omit or use aggregate for multi-source default (currently Hardcover only). Explicit hardcover pins to that provider.",
    options: ["aggregate", "hardcover"],
  },
  {
    name: "limit",
    type: "number",
    required: false,
    description: "Number of results to return (default: 10, max: 50)",
    placeholder: "10",
  },
];

export const searchSeriesApiResponse = {
  success: true,
  provider: "aggregate",
  results: {
    query: "The Empyrean",
    totalResults: 2,
    series: [
      {
        id: "41764",
        provider: "hardcover",
        name: "The Empyrean",
        slug: "the-empyrean",
        author: "Rebecca Yarros",
        booksCount: 12,
        primaryBooksCount: 3,
        readersCount: 120000,
        sampleBooks: ["Fourth Wing", "Iron Flame", "Onyx Storm"],
      },
    ],
  },
};

export const searchSeriesCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
