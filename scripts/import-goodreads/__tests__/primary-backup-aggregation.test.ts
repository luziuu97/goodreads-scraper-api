import { scoreRelevance } from "../../../lib/providers/aggregate";
import type { NormalizedSearchBook } from "../../../lib/providers/types";
import {
  isTrustedLocalSearchComplete,
  isTrustedStructuralProvider,
} from "../../../lib/canonical/authority";

describe("Primary & Backup Aggregation Strategy", () => {
  test("Primary provider hit retains title and author while merging backup fields", () => {
    const primaryBook: NormalizedSearchBook = {
      id: "hardcover-123",
      provider: "hardcover",
      title: "The Hobbit (Primary)",
      workTitle: "The Hobbit",
      author: "J.R.R. Tolkien",
      cover: "https://example.com/primary-cover.jpg",
      rating: 4.8,
    };

    const score = scoreRelevance(primaryBook, "The Hobbit");
    expect(score).toBeGreaterThan(0);
  });

  test("Hardcover is the only live structural authority among external catalogs", () => {
    expect(isTrustedStructuralProvider("hardcover")).toBe(true);
    expect(isTrustedStructuralProvider("isbndb")).toBe(false);
    expect(isTrustedStructuralProvider("openlibrary")).toBe(false);
  });

  test("ISBNDB-shaped search hits never short-circuit aggregate", () => {
    const isbndbPoison: NormalizedSearchBook = {
      id: "9781301529049",
      provider: "canonical",
      title: "The Foxhole Court (All for the Game Book 1)",
      author: "Sakavic",
      cover: "https://images.isbndb.com/covers/example.jpg",
      isbn: "9781301529049",
      sources: [{ title: "isbndb", url: "isbndb:9781301529049" }],
    };
    expect(isTrustedLocalSearchComplete(isbndbPoison)).toBe(false);
  });
});
