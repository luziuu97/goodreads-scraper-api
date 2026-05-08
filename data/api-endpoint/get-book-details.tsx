import { CodeSnippets } from "@/lib/api-endpoints";

export const getBookDetailsApiParameters = [
  {
    name: "slug",
    type: "string",
    required: true,
    description: "Goodreads book slug",
    placeholder: "18144590-the-alchemist",
  },
  {
    name: "reviews",
    type: "select",
    required: false,
    description:
      "Set to true to include scraped reviews. Reviews are excluded by default.",
    options: ["true"],
  },
];

export const getBookDetailsApiResponse = {
  success: true,
  scrapedURL: "https://www.goodreads.com/book/show/18144590-the-alchemist",
  book: {
    cover:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1654371463i/18144590.jpg",
    series: "",
    slug: "18144590-the-alchemist",
    title: "The Alchemist",
    author: [
      {
        id: 1,
        name: "Paulo Coelho",
        url: "/author/show/566.Paulo_Coelho",
      },
    ],
    illustrators: [],
    rating: "3.92",
    ratingCount: "3,363,456 ",
    reviewsCount: "135,508 reviews135,508 reviews",
    description:
      "Combining magic, mysticism, wisdom, and wonder into an inspiring tale of self-discovery, The Alchemist has become a modern classic, selling millions of copies around the world and transforming the lives of countless readers across generations.Paulo Coelho's masterpiece tells the mystical story of Santiago, an Andalusian shepherd boy who yearns to travel in search of a worldly treasure. His quest will lead him to riches far different—and far more satisfying—than he ever imagined. Santiago's journey teaches us about the essential wisdom of listening to our hearts, recognizing opportunity and learning to read the omens strewn along life's path, and, most importantly, following our dreams.",
    genres: [
      "",
      "Fiction",
      "Fantasy",
      "Philosophy",
      "Self Help",
      "Book Club",
      "Novels",
      "Spirituality",
    ],
    bookEdition: "182 pages, Paperback",
    publishDate: "First published January 1, 1988",
    related: [],
    reviewBreakdown: {
      rating5: "1,333,077",
      rating4: "973,336",
      rating3: "651,958",
      rating2: "260,381",
      rating1: "144,704",
    },
    quotes: "2,569",
    quotesURL: "https://www.goodreads.com/work/quotes/4835472",
    questions: "119",
    questionsURL: "https://www.goodreads.com/book/18144590/questions",
    lastScraped: "2025-04-27T06:16:05.253Z",
  },
};

export const getBookDetailsCodeSnippets: CodeSnippets = {
  javascript: ``,
  typescript: ``,
  python: ``,
  nodejs: ``,
};
