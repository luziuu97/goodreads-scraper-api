import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "BooksAPI",
    version: "1.0.0",
    description: "Structured Book & Series Metadata API",
    status: "operational",
    endpoints: {
      search_books: "GET /api/book/search?query={query}",
      book_details: "GET /api/book/details/{slug}",
      book_covers: "GET /api/book/covers/{slug}",
      book_formats: "GET /api/book/formats/{slug}",
      batch_search: "POST /api/book/batch-search",
      search_series: "GET /api/series/search?query={query}",
      series_details: "GET /api/series/{slug}",
      admin_works: "GET|POST /api/admin/works",
      admin_editions: "GET|POST /api/admin/editions",
      admin_authors: "GET|POST /api/admin/authors",
      admin_series: "GET|POST /api/admin/series",
      admin_genres: "GET|POST /api/admin/genres",
    },
  });
}
