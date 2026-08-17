import { rankEditionsForPresentation } from "@/lib/canonical/edition-selection";
import { canonicalWorkToSearchBook } from "@/lib/canonical/reader";

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

describe("ISBN search presentation", () => {
  const work = {
    id: "work-1",
    canonicalTitle: "Water Moon",
    originalLanguage: "en",
    averageRating: 4.1,
    ratingsCount: 1000,
    publicationYear: 2025,
    contributors: [{ isPrimary: true, author: { name: "Samantha Sotto Yambao" } }],
    seriesMemberships: [],
    translations: [{ language: "es", title: "Las furias invisibles del corazón" }],
    titles: [],
    genres: [],
    externalIds: [{ provider: "hardcover", externalId: "1" }],
    editions,
  };

  it("returns the ISBN edition even when language prefers a different one", () => {
    const book = canonicalWorkToSearchBook(
      work,
      "es",
      "9780857505347",
      "9780857505347"
    );

    expect(book.isbn).toBe("9780857505347");
    expect(book.languageCode).toBe("en");
    expect(book.presentation).toBe("isbn");
  });

  it("presents the ISBN edition title when language is not applied", () => {
    const book = canonicalWorkToSearchBook(
      work,
      undefined,
      "9780857505347",
      "9780857505347"
    );

    expect(book.title).toBe("Water Moon");
  });
});
