import {
  collapseAuthorFragments,
  extractPrimaryAuthorName,
  isTrustedLocalDetailsComplete,
  isTrustedLocalSearchComplete,
  isTrustedStructuralProvider,
  parseSeriesLabel,
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
