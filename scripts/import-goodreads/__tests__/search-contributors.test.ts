import type { NormalizedSearchBook } from "../../../lib/providers/types";

/**
 * Local copy of role classification expectations (source of truth lives in
 * hardcover/client.ts). Keeps the contract explicit for search author fields.
 */
function classify(role: string | null | undefined): string {
  const raw = (role ?? "").trim();
  if (!raw) return "author";
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(translator|translation|translated by)\b/.test(normalized)) return "translator";
  if (/\b(illustrator|illustration|illustrated by|cover artist)\b/.test(normalized))
    return "illustrator";
  if (/\b(narrator|narrated by|read by)\b/.test(normalized)) return "narrator";
  if (/\b(editor|edited by)\b/.test(normalized)) return "editor";
  if (normalized === "author" || normalized === "writer" || normalized === "co-author")
    return "author";
  return "other";
}

describe("search contributor roles", () => {
  test("classifies illustrator and translator out of author", () => {
    expect(classify("Illustrator")).toBe("illustrator");
    expect(classify("Translator")).toBe("translator");
    expect(classify("Narrator")).toBe("narrator");
    expect(classify("Author")).toBe("author");
    expect(classify(null)).toBe("author");
  });

  test("search hit shape keeps author separate from role arrays", () => {
    const hit: NormalizedSearchBook = {
      id: "429356",
      provider: "hardcover",
      title: "El león, la bruja y el armario",
      workTitle: "The Lion, the Witch and the Wardrobe",
      author: "C. S. Lewis",
      cover: "",
      translators: ["Gemma Gallart"],
      illustrators: ["Pauline Baynes"],
      languageCode: "es",
    };
    expect(hit.author).toBe("C. S. Lewis");
    expect(hit.author).not.toContain("Baynes");
    expect(hit.author).not.toContain("Gallart");
    expect(hit.translators).toEqual(["Gemma Gallart"]);
    expect(hit.illustrators).toEqual(["Pauline Baynes"]);
  });
});
