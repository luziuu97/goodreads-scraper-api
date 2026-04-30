const cheerio = require("cheerio");

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

function normalizeInlineWhitespace(text: string): string {
  return collapseWhitespace(text).trim();
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function renderChildren($: any, node: any): string {
  return $(node)
    .contents()
    .map((_: number, child: any) => renderNode($, child))
    .get()
    .join("");
}

function renderList($: any, node: any, ordered: boolean): string {
  const items = $(node)
    .children("li")
    .map((index: number, li: any) => {
      const content = renderChildren($, li)
        .split("\n")
        .map((line: string, lineIndex: number) =>
          lineIndex === 0 ? line.trim() : `  ${line.trim()}`
        )
        .join("\n")
        .trim();

      if (!content) return "";
      const marker = ordered ? `${index + 1}. ` : "- ";
      return `${marker}${content}`;
    })
    .get()
    .filter(Boolean);

  return items.length ? `\n\n${items.join("\n")}\n\n` : "";
}

function renderNode($: any, node: any): string {
  if (node.type === "text") {
    return escapeMarkdown(collapseWhitespace($(node).text()));
  }

  if (node.type !== "tag") {
    return "";
  }

  const tag = node.tagName?.toLowerCase();
  const textContent = normalizeInlineWhitespace($(node).text());

  switch (tag) {
    case "br":
      return "\n";
    case "p":
    case "div": {
      const content = renderChildren($, node).trim();
      return content ? `\n\n${content}\n\n` : "";
    }
    case "strong":
    case "b": {
      const content = renderChildren($, node).trim();
      return content ? `**${content}**` : "";
    }
    case "em":
    case "i": {
      const content = renderChildren($, node).trim();
      return content ? `*${content}*` : "";
    }
    case "a": {
      const href = $(node).attr("href")?.trim();
      const content = renderChildren($, node).trim() || escapeMarkdown(textContent);
      if (!content) return "";
      return href ? `[${content}](${href})` : content;
    }
    case "img": {
      const src = $(node).attr("src")?.trim();
      const alt = normalizeInlineWhitespace($(node).attr("alt") || "");
      if (!src) return "";
      return `![${escapeMarkdown(alt)}](${src})`;
    }
    case "ul":
      return renderList($, node, false);
    case "ol":
      return renderList($, node, true);
    case "blockquote": {
      const content = renderChildren($, node)
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean)
        .map((line: string) => `> ${line}`)
        .join("\n");
      return content ? `\n\n${content}\n\n` : "";
    }
    case "span":
    case "section":
    default:
      return renderChildren($, node);
  }
}

export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return "";

  const $ = cheerio.load(`<div data-markdown-root="true">${html}</div>`);
  const root = $('[data-markdown-root="true"]');

  root.find("script, style, button, noscript").remove();

  const markdown = renderChildren($, root)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\s])([*_`])(?=\S)/g, "$1$2")
    .trim();

  return markdown;
}
