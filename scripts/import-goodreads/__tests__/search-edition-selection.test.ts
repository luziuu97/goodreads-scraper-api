import { rankEditionsForPresentation } from "@/lib/canonical/edition-selection";

const editions = [
  {
    id: "fr",
    title: "Water Moon",
    language: "fr",
    isbn13: "9782387218162",
    isDefault: true,
    covers: [{ url: "fr.jpg" }],
  },
  {
    id: "en",
    title: "Water Moon",
    language: "English",
    isbn13: "9780857505347",
    covers: [{ url: "en.jpg" }],
  },
  {
    id: "es",
    title: "Las furias invisibles del corazón",
    language: "spa",
    isbn13: "9788418107795",
  },
];

describe("search edition presentation ranking", () => {
  it("prefers English over a foreign first/default edition for an English work-title query", () => {
    const ranked = rankEditionsForPresentation(editions, {
      originalLanguage: "fr",
      query: "Water Moon",
    });

    expect(ranked[0].id).toBe("en");
  });

  it("honors an explicit language above the English fallback", () => {
    const ranked = rankEditionsForPresentation(editions, {
      requestedLanguage: "fr",
      originalLanguage: "en",
      query: "Water Moon",
    });

    expect(ranked[0].id).toBe("fr");
  });

  it("honors a detected translated-title language", () => {
    const ranked = rankEditionsForPresentation(editions, {
      requestedLanguage: "es",
      originalLanguage: "en",
      query: "Las furias invisibles del corazón",
    });

    expect(ranked[0].id).toBe("es");
  });
});
