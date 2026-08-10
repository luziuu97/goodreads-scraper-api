import type { Metadata } from "next";
import "./globals.css";
import { ApiProvider } from "@/lib/active-endpoint-context";
import { TargetApiProvider } from "@/lib/api-target-context";

export const metadata: Metadata = {
  title: "BooksAPI - Structured Metadata & Visual Discovery Engine",
  description:
    "A high-performance, structured API & visual platform for books, series, covers, formats, and batch catalog metadata.",
  generator: "Next.js",
  keywords: ["books", "api", "metadata", "hardcover", "reading", "library", "isbndb", "openlibrary", "booksapi"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
        <TargetApiProvider>
          <ApiProvider>
            <div className="min-h-screen flex flex-col bg-slate-950">
              {children}
            </div>
          </ApiProvider>
        </TargetApiProvider>
      </body>
    </html>
  );
}

