import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const searchBooksApiParameters: Parameter[] = [
  {
    name: "query",
    type: "string",
    required: true,
    description: "Search query (title, author, or ISBN)",
    placeholder: "fourth wing",
  },
  {
    name: "type",
    type: "select",
    required: false,
    description: "Type of search to perform",
    options: ["all", "title", "author", "isbn"],
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
    placeholder: "20",
  },
];

export const searchBooksApiResponse = {
  success: true,
  provider: "aggregate",
  results: {
    query: "fourth wing",
    totalResults: 2,
    books: [
      {
        id: "1662524",
        provider: "hardcover",
        title: "Fourth Wing",
        author: "Rebecca Yarros",
        cover: "https://assets.hardcover.app/covers/fourth-wing.jpg",
        rating: 4.58,
        publicationDate: "2023-05-02",
        genres: ["Fantasy", "Romance", "New Adult"],
      },
      {
        id: "1662525",
        provider: "hardcover",
        title: "Iron Flame",
        author: "Rebecca Yarros",
        cover: "https://assets.hardcover.app/covers/iron-flame.jpg",
        rating: 4.5,
        publicationDate: "2023-11-07",
        genres: ["Fantasy", "Romance"],
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
