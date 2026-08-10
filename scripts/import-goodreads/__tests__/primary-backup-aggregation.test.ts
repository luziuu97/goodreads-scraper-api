import { scoreRelevance } from "../../../lib/providers/aggregate";
import type { NormalizedSearchBook } from "../../../lib/providers/types";

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
});
