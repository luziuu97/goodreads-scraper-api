import {
  normalizeBookFormat,
  toApiBookFormat,
  toApiFormatLabel,
} from "../../../lib/canonical/constants";

describe("book format normalization", () => {
  test("Hardcover reading_format Ebook maps to EBOOK even when edition_format is null", () => {
    expect(normalizeBookFormat(null, "Ebook")).toBe("EBOOK");
    expect(normalizeBookFormat(undefined, "Ebook")).toBe("EBOOK");
    expect(toApiBookFormat(null, "Ebook")).toBe("ebook");
  });

  test("public API emits lowercase formats; other is last resort", () => {
    expect(toApiBookFormat("Hardcover")).toBe("hardcover");
    expect(toApiBookFormat("HARDCOVER")).toBe("hardcover");
    expect(toApiBookFormat("Paperback")).toBe("paperback");
    expect(toApiBookFormat("Mass Market Paperback")).toBe("paperback");
    expect(toApiBookFormat("Kindle Edition")).toBe("ebook");
    expect(toApiBookFormat("Audiobook")).toBe("audiobook");
    expect(toApiBookFormat(null, "Listened")).toBe("audiobook");
    // Known physical-without-binding still maps to paperback
    expect(toApiBookFormat(null, "Read")).toBe("paperback");
    // Unclassified values stay other — never Title Case / OTHER
    expect(toApiBookFormat("OTHER")).toBe("other");
    expect(toApiBookFormat("calendar")).toBe("other");
    expect(toApiBookFormat(null)).toBe("other");
  });

  test("format labels are title-case; raw source only for other", () => {
    expect(toApiFormatLabel("HARDCOVER")).toBe("Hardcover");
    expect(toApiFormatLabel("Kindle Edition")).toBe("Ebook");
    expect(toApiFormatLabel("OTHER")).toBe("Other");
    expect(toApiFormatLabel("calendar")).toBe("calendar");
  });

  test("e-book hyphenation and digital aliases", () => {
    expect(normalizeBookFormat("e-book")).toBe("EBOOK");
    expect(normalizeBookFormat("E-Book")).toBe("EBOOK");
    expect(normalizeBookFormat("digital")).toBe("EBOOK");
  });
});
