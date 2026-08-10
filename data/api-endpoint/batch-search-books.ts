import { Parameter, CodeSnippets } from "@/lib/api-endpoints";

export const batchSearchBooksApiParameters: Parameter[] = [
  {
    name: "provider",
    type: "select",
    required: false,
    description:
      "Data provider mode (omit or aggregate for multi-source default).",
    options: ["aggregate", "hardcover", "isbndb", "openlibrary"],
  },
  {
    name: "body",
    type: "json",
    required: true,
    description:
      "JSON array of up to 50 search items (query, title, author, isbn, type, language, limit).",
    placeholder: '{\n  "provider": "aggregate",\n  "items": [\n    { "query": "Dune", "limit": 5 },\n    { "isbn": "9780441172719" },\n    { "title": "Foundation", "author": "Isaac Asimov" }\n  ]\n}',
  },
];

export const batchSearchBooksApiResponse = {
  success: true,
  provider: "aggregate",
  totalItems: 3,
  successfulItems: 3,
  failedItems: 0,
  results: [
    {
      index: 0,
      query: "Dune",
      success: true,
      books: [
        {
          id: "1662524",
          provider: "hardcover",
          title: "Dune",
          author: "Frank Herbert",
          cover: "https://assets.hardcover.app/edition/...",
          rating: 4.67,
          publicationDate: "1965-08-01",
        },
      ],
    },
    {
      index: 1,
      query: "9780441172719",
      success: true,
      books: [
        {
          id: "1662524",
          provider: "hardcover",
          title: "Dune",
          author: "Frank Herbert",
          cover: "https://assets.hardcover.app/edition/...",
          isbn: "9780441172719",
        },
      ],
    },
    {
      index: 2,
      query: "Foundation Isaac Asimov",
      success: true,
      books: [
        {
          id: "1662527",
          provider: "hardcover",
          title: "Foundation",
          author: "Isaac Asimov",
          cover: "https://assets.hardcover.app/edition/...",
          rating: 4.52,
        },
      ],
    },
  ],
};

export const batchSearchBooksCodeSnippets: CodeSnippets = {
  javascript: `const response = await fetch('/api/book/batch-search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'aggregate',
    items: [
      { query: 'Dune', limit: 5 },
      { isbn: '9780441172719' },
      { title: 'Foundation', author: 'Isaac Asimov' }
    ]
  })
});
const data = await response.json();
console.log(data);`,
  typescript: `import axios from 'axios';

interface BatchSearchPayload {
  provider?: string;
  items: Array<{
    query?: string;
    isbn?: string;
    title?: string;
    author?: string;
    limit?: number;
    language?: string;
  }>;
}

const { data } = await axios.post('/api/book/batch-search', {
  provider: 'aggregate',
  items: [
    { query: 'Dune', limit: 5 },
    { isbn: '9780441172719' }
  ]
} as BatchSearchPayload);`,
  python: `import requests

url = "https://api.example.com/api/book/batch-search"
payload = {
    "provider": "aggregate",
    "items": [
        {"query": "Dune", "limit": 5},
        {"isbn": "9780441172719"},
        {"title": "Foundation", "author": "Isaac Asimov"}
    ]
}

response = requests.post(url, json=payload)
data = response.json()
print(data)`,
  nodejs: `import fetch from 'node-fetch';

async function batchSearchBooks() {
  const res = await fetch('https://api.example.com/api/book/batch-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'aggregate',
      items: [
        { query: 'Dune', limit: 5 },
        { isbn: '9780441172719' }
      ]
    })
  });
  return res.json();
}`,
};
