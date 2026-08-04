import { readFileSync } from "fs";
import { resolve } from "path";

const env = readFileSync(resolve(process.cwd(), ".env"), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

import { searchHardcoverBooks } from "../lib/providers/hardcover/client";

function summarize(book: any) {
  return {
    title: book.title,
    workTitle: book.workTitle,
    presentation: book.presentation,
    language: book.language,
    languageCode: book.languageCode,
    translators: book.translators,
    cover: book.cover?.slice(0, 80),
    editionId: book.edition?.id,
    editionTitle: book.edition?.title,
    publisher: book.edition?.publisher,
    isbn: book.edition?.isbn,
  };
}

async function main() {
  console.log("=== query: Juego de Tronos ===");
  const a = await searchHardcoverBooks({
    query: "Juego de Tronos",
    limit: 3,
    type: "all",
  });
  console.log(JSON.stringify(a.books.map(summarize), null, 2));

  console.log("=== query: Game of Thrones, language=es ===");
  const b = await searchHardcoverBooks({
    query: "Game of Thrones",
    limit: 3,
    type: "all",
    language: "es",
  });
  console.log(JSON.stringify(b.books.map(summarize), null, 2));

  console.log("=== query: Game of Thrones (no lang) ===");
  const c = await searchHardcoverBooks({
    query: "Game of Thrones",
    limit: 2,
    type: "all",
  });
  console.log(JSON.stringify(c.books.map(summarize), null, 2));

  console.log("=== ISBN French little prince ===");
  const d = await searchHardcoverBooks({
    query: "9780156013987",
    limit: 1,
    type: "isbn",
  });
  console.log(JSON.stringify(d.books.map(summarize), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
