import {
  normalizeBookFormat,
  toApiBookFormat,
} from "../../../lib/canonical/constants";

describe("book format normalization", () => {
  test("Hardcover reading_format Ebook maps to EBOOK even when edition_format is null", () => {
    expect(normalizeBookFormat(null, "Ebook")).toBe("EBOOK");
    expect(normalizeBookFormat(undefined, "Ebook")).toBe("EBOOK");
    expect(toApiBookFormat(null, "Ebook")).toBe("ebook");
  });

  test("public API only emits the four main formats", () => {
    expect(toApiBookFormat("Hardcover")).toBe("hardcover");
    expect(toApiBookFormat("Paperback")).toBe("paperback");
    expect(toApiBookFormat("Mass Market Paperback")).toBe("paperback");
    expect(toApiBookFormat("Kindle Edition")).toBe("ebook");
    expect(toApiBookFormat("Audiobook")).toBe("audiobook");
    expect(toApiBookFormat(null, "Listened")).toBe("audiobook");
    // Unknown / OTHER defaults to paperback
    expect(toApiBookFormat("OTHER")).toBe("paperback");
    expect(toApiBookFormat(null, "Read")).toBe("paperback");
  });

  test("e-book hyphenation and digital aliases", () => {
    expect(normalizeBookFormat("e-book")).toBe("EBOOK");
    expect(normalizeBookFormat("E-Book")).toBe("EBOOK");
    expect(normalizeBookFormat("digital")).toBe("EBOOK");
  });
});
