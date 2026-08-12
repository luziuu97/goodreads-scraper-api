import {
  isCompilationOrDerivativeTitle,
} from "../../../lib/canonical/constants";
import {
  applyReaderPopularityFloor,
  scoreRelevance,
} from "../../../lib/providers/aggregate";
import type { NormalizedSearchBook } from "../../../lib/providers/types";

describe("search ranking & compilation filters", () => {
  test("detects compilations and derivatives", () => {
    expect(isCompilationOrDerivativeTitle("A Game of Thrones 4-Book Bundle")).toBe(true);
    expect(
      isCompilationOrDerivativeTitle(
        "George R. R. Martin's A Game of Thrones 5-Book Boxed Set"
      )
    ).toBe(true);
    expect(isCompilationOrDerivativeTitle("A Game of Thrones #3")).toBe(true);
    expect(isCompilationOrDerivativeTitle("A Game of Thrones, Part one")).toBe(true);
    expect(
      isCompilationOrDerivativeTitle("A Game of Thrones: Graphic Novel, Volume Four")
    ).toBe(true);
    expect(isCompilationOrDerivativeTitle("Game of Thrones: In Memoriam")).toBe(true);
    expect(
      isCompilationOrDerivativeTitle(
        "The World of Ice and Fire: The Untold History of Westeros and the Game of Thrones"
      )
    ).toBe(true);
    expect(
      isCompilationOrDerivativeTitle(
        "A Game of Thrones: The Story Continues: The Complete 5 Books"
      )
    ).toBe(true);
    expect(isCompilationOrDerivativeTitle("A Game of Thrones")).toBe(false);
    expect(isCompilationOrDerivativeTitle("Game of Thrones")).toBe(false);
  });

  test("reader popularity floor drops low-traffic title collisions", () => {
    const books: NormalizedSearchBook[] = [
      {
        id: "1",
        provider: "hardcover",
        title: "A Game of Thrones",
        author: "George R.R. Martin",
        cover: "",
        readersCount: 10000,
      },
      {
        id: "2",
        provider: "hardcover",
        title: "Game of Thrones",
        author: "Matthew Reinhart",
        cover: "",
        readersCount: 15,
      },
    ];
    const filtered = applyReaderPopularityFloor(books);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].author).toBe("George R.R. Martin");
  });

  test("popularity floor does not wipe Hardcover readers using Goodreads ratings scale", () => {
    const books: NormalizedSearchBook[] = [
      {
        id: "local",
        provider: "canonical",
        title: "Harry Potter y la Orden del Fénix",
        author: "J.K. Rowling",
        cover: "",
        ratingsCount: 1_875_594,
        languageCode: "es",
      },
      {
        id: "hc-1",
        provider: "hardcover",
        title: "Harry Potter y la piedra filosofal",
        author: "J.K. Rowling",
        cover: "",
        readersCount: 16301,
        languageCode: "es",
      },
      {
        id: "hc-2",
        provider: "hardcover",
        title: "Harry Potter y la cámara secreta",
        author: "J.K. Rowling",
        cover: "",
        readersCount: 12750,
        languageCode: "es",
      },
    ];
    const filtered = applyReaderPopularityFloor(books);
    expect(filtered.map((b) => b.id).sort()).toEqual(
      ["hc-1", "hc-2", "local"].sort()
    );
  });

  test("popular primary novel outranks exact-title low-reader hit", () => {
    const primary: NormalizedSearchBook = {
      id: "644",
      provider: "hardcover",
      title: "A Game of Thrones",
      workTitle: "A Game of Thrones",
      author: "George R.R. Martin",
      cover: "https://example.com/agot.jpg",
      rating: 4.4,
      readersCount: 50000,
      ratingsCount: 40000,
      isbn: "9780553588484",
    };
    const popup: NormalizedSearchBook = {
      id: "655333",
      provider: "hardcover",
      title: "Game of Thrones",
      workTitle: "Game of Thrones",
      author: "Matthew Reinhart",
      cover: "https://example.com/popup.jpg",
      rating: 4,
      readersCount: 12,
    };

    const query = "game of thrones";
    expect(scoreRelevance(primary, query)).toBeGreaterThan(scoreRelevance(popup, query));
  });

  test("compilations are heavily demoted", () => {
    const novel: NormalizedSearchBook = {
      id: "1",
      provider: "hardcover",
      title: "A Game of Thrones",
      author: "George R.R. Martin",
      cover: "",
      readersCount: 1000,
    };
    const bundle: NormalizedSearchBook = {
      id: "2",
      provider: "hardcover",
      title: "A Game of Thrones 4-Book Bundle",
      author: "George R.R. Martin",
      cover: "",
      readersCount: 5000,
    };
    expect(scoreRelevance(novel, "game of thrones")).toBeGreaterThan(
      scoreRelevance(bundle, "game of thrones")
    );
  });
});
