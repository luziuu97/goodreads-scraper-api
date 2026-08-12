import {
  collapseAuthorFragments,
  extractPrimaryAuthorName,
  findEditionByIsbn,
  isTrustedLocalDetailsComplete,
  isTrustedLocalSearchComplete,
  isTrustedStructuralProvider,
  needsLocalizedDescriptionLookup,
  normalizeLookupIsbn,
  parseSeriesLabel,
  resolveDetailsDescriptionLanguage,
  siblingIsbnsForLanguage,
  workHasDescriptionInLanguage,
  workHasTrustedSource,
} from "../../../lib/canonical/authority";

describe("authority policy", () => {
  test("trusted structural providers are Hardcover and Goodreads dataset only", () => {
    expect(isTrustedStructuralProvider("hardcover")).toBe(true);
    expect(isTrustedStructuralProvider("goodreads")).toBe(true);
    expect(isTrustedStructuralProvider("goodreads-dataset")).toBe(true);
    expect(isTrustedStructuralProvider("isbndb")).toBe(false);
    expect(isTrustedStructuralProvider("openlibrary")).toBe(false);
  });

  test("ISBNDB-only works are not trusted local sources", () => {
    expect(
      workHasTrustedSource({
        externalIds: [{ provider: "isbndb" }],
      })
    ).toBe(false);
    expect(
      workHasTrustedSource({
        externalIds: [{ provider: "hardcover" }],
      })
    ).toBe(true);
    expect(
      workHasTrustedSource({
        sources: [{ title: "goodreads-dataset" }],
      })
    ).toBe(true);
  });

  test("search short-circuit rejects untrusted ISBN-only hits", () => {
    expect(
      isTrustedLocalSearchComplete({
        provider: "canonical",
        author: "Sakavic",
        isbn: "9781301529049",
        sources: [{ title: "isbndb" }],
      })
    ).toBe(false);

    expect(
      isTrustedLocalSearchComplete({
        provider: "hardcover",
        author: "Nora Sakavic",
        isbn: "9781301529049",
        rating: 3.7,
      })
    ).toBe(true);
  });

  test("details short-circuit requires trusted source + rating + author + known formats", () => {
    const poisoned = {
      externalIds: [{ provider: "isbndb" }],
      averageRating: null,
      translations: [{ description: "blurb" }],
      contributors: [{ role: "AUTHOR", author: { name: "Sakavic" } }],
      editions: [{ isbn13: "9781301529049", pages: 269 }],
    };
    expect(isTrustedLocalDetailsComplete(poisoned)).toBe(false);

    const thinTrusted = {
      externalIds: [{ provider: "hardcover" }],
      averageRating: 3.73,
      translations: [{ description: "blurb" }],
      contributors: [{ role: "AUTHOR", author: { name: "Nora Sakavic" } }],
      editions: [
        {
          isbn13: "9781301529049",
          pages: 269,
          asin: "B00E9BLRUI",
          format: "OTHER",
        },
      ],
    };
    expect(isTrustedLocalDetailsComplete(thinTrusted)).toBe(false);

    const trusted = {
      externalIds: [{ provider: "hardcover" }],
      averageRating: 3.73,
      translations: [{ description: "blurb" }],
      contributors: [{ role: "AUTHOR", author: { name: "Nora Sakavic" } }],
      editions: [
        {
          isbn13: "9781301529049",
          pages: 269,
          asin: "B00E9BLRUI",
          format: "EBOOK",
        },
        {
          isbn13: "9781516801510",
          pages: 260,
          format: "PAPERBACK",
        },
      ],
    };
    expect(isTrustedLocalDetailsComplete(trusted)).toBe(true);

    const seriesWithoutPosition = {
      ...trusted,
      seriesMemberships: [
        { position: null, series: { canonicalName: "Harry Potter" } },
      ],
    };
    expect(isTrustedLocalDetailsComplete(seriesWithoutPosition)).toBe(false);

    const seriesWithPosition = {
      ...trusted,
      seriesMemberships: [
        { position: 1, series: { canonicalName: "Harry Potter" } },
      ],
    };
    expect(isTrustedLocalDetailsComplete(seriesWithPosition)).toBe(true);
  });

  test("translated details still look incomplete without a matching-language synopsis", () => {
    const spanishEdition = {
      isbn13: "9786313003587",
      language: "es",
      pages: 357,
      format: "PAPERBACK",
    };
    const work = {
      originalLanguage: "en",
      translations: [
        {
          language: "en",
          description:
            "As alluring as it is unsettling, award-winning author CG Drews' debut YA psychological horror will leave readers breathless.",
        },
        { language: "es", title: "No dejes entrar al bosque", description: null },
      ],
      editions: [
        spanishEdition,
        { isbn13: "9781250325723", language: "en", pages: 336, format: "HARDCOVER" },
      ],
    };

    expect(workHasDescriptionInLanguage(work, "en")).toBe(true);
    expect(workHasDescriptionInLanguage(work, "es")).toBe(false);
    expect(
      needsLocalizedDescriptionLookup(work, "es", true)
    ).toBe(true);
    expect(
      needsLocalizedDescriptionLookup(work, "en", true)
    ).toBe(false);

    const withSpanish = {
      ...work,
      translations: [
        work.translations[0],
        {
          language: "es",
          description:
            "Ahora que han regresado a la Academia Wickwood y su hermana melliza parece evitarlo, Andrew se ha vuelto más cercano a Thomas.",
        },
      ],
    };
    expect(workHasDescriptionInLanguage(withSpanish, "es")).toBe(true);
    expect(needsLocalizedDescriptionLookup(withSpanish, "es", true)).toBe(false);
  });

  test("description language prefers the matched edition over Hardcover English", () => {
    expect(
      resolveDetailsDescriptionLanguage({
        requestedLanguage: null,
        matchedEditionLanguage: "es",
        hardcoverLanguage: "en",
        originalLanguage: "en",
      })
    ).toBe("es");
    expect(
      resolveDetailsDescriptionLanguage({
        requestedLanguage: "es",
        matchedEditionLanguage: "en",
        hardcoverLanguage: "en",
        originalLanguage: "en",
      })
    ).toBe("es");
    expect(
      resolveDetailsDescriptionLanguage({
        requestedLanguage: null,
        matchedEditionLanguage: null,
        hardcoverLanguage: "en",
        originalLanguage: "en",
      })
    ).toBe("en");
  });

  test("sibling ISBN lookup prefers the requested ISBN then same-language editions", () => {
    const work = {
      editions: [
        { isbn13: "9786313003587", language: "es" },
        { isbn13: "9786076371664", language: "es" },
        { isbn13: "9781250325723", language: "en" },
      ],
    };
    expect(normalizeLookupIsbn("978-63-1300-358-7")).toBe("9786313003587");
    expect(findEditionByIsbn(work, "9786313003587")?.isbn13).toBe("9786313003587");
    expect(siblingIsbnsForLanguage(work, "es", "9786313003587", 3)).toEqual([
      "9786313003587",
      "9786076371664",
    ]);
  });

  test("parseSeriesLabel extracts name and position", () => {
    expect(parseSeriesLabel("All for the Game #1")).toEqual({
      name: "All for the Game",
      position: 1,
    });
    expect(parseSeriesLabel("The Empyrean")).toEqual({
      name: "The Empyrean",
      position: null,
    });
  });

  test("collapseAuthorFragments removes subset name pollution", () => {
    const collapsed = collapseAuthorFragments([
      { id: "1", name: "Sakavic" },
      { id: "2", name: "Nora" },
      { id: "3", name: "Nora Sakavic" },
    ]);
    expect(collapsed.map((a) => a.name)).toEqual(["Nora Sakavic"]);
  });

  test("extractPrimaryAuthorName handles Hardcover author arrays", () => {
    expect(
      extractPrimaryAuthorName([
        { id: 1, name: "Nora Sakavic", url: "https://hardcover.app/authors/nora-sakavic" },
      ])
    ).toBe("Nora Sakavic");
    expect(extractPrimaryAuthorName("Nora Sakavic")).toBe("Nora Sakavic");
  });
});
