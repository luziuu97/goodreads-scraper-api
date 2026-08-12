import {
  htmlToMarkdown,
  stripAlternateCoverNotes,
} from "../../../lib/canonical/constants";

describe("stripAlternateCoverNotes", () => {
  test("removes common librarian alternate-cover lines", () => {
    const samples = [
      "An alternate cover edition can be found here.",
      "Librarian's note: An alternate cover for this ASIN can be found ...",
      "Librarian's Note: An alternate cover for this ASIN can be found ...",
      "[An alternate cover edition for this ISBN can be found]",
      "(Librarian's note: An alternate cover edition to this ISBN is provided)",
      "An alternate cover of this ISBN can be found ...",
      "An alternate cover for this ASIN can be found ...",
    ];
    for (const sample of samples) {
      const cleaned = stripAlternateCoverNotes(
        `Great story about dragons.\n\n${sample}\n\nMore plot.`
      );
      expect(cleaned.toLowerCase()).not.toContain("alternate cover");
      expect(cleaned.toLowerCase()).not.toContain("librarian");
      expect(cleaned).toContain("Great story about dragons.");
      expect(cleaned).toContain("More plot.");
    }
  });

  test("htmlToMarkdown also strips alternate cover notes", () => {
    const raw =
      "<p>Neil Josten is the newest addition.</p><p>Librarian's note: An alternate cover for this ASIN can be found here.</p>";
    const md = htmlToMarkdown(raw);
    expect(md).toContain("Neil Josten");
    expect(md.toLowerCase()).not.toContain("alternate cover");
  });
});
