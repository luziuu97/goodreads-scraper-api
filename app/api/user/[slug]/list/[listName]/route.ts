import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, fetchWithConfig } from "@/lib/api-config";
import {
  generateCacheKey,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/redis-cache";
const cheerio = require("cheerio");

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteGoodreadsUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    return "";
  }

  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  return `https://www.goodreads.com${pathOrUrl}`;
}

function extractInteger(text: string): number | null {
  const match = normalizeText(text).replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function extractDecimal(text: string): number | null {
  const match = normalizeText(text).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function extractFieldValue($field: any): string {
  if (!$field || $field.length === 0) {
    return "";
  }

  const valueText = normalizeText($field.find(".value").first().text());
  if (valueText) {
    return valueText;
  }

  return normalizeText($field.text());
}

function parseReviewField($field: any): string | null {
  if (!$field || $field.length === 0) {
    return null;
  }

  const fullReviewNode = $field.find("span[id^='freeTextreview']").first();
  const previewNode = $field.find("span[id^='freeTextContainerreview']").first();
  const sourceNode = fullReviewNode.length ? fullReviewNode : previewNode;

  if (sourceNode.length) {
    const rawHtml = sourceNode.html() || "";
    const normalizedHtml = rawHtml
      .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n");
    const text = cheerio.load(`<div>${normalizedHtml}</div>`)("div").text().trim();
    return text ? text : null;
  }

  const text = extractFieldValue($field);
  return text || null;
}

function parseFieldDate($field: any): string | null {
  if (!$field || $field.length === 0) {
    return null;
  }

  const explicitTitle = $field.find("span[title]").first().attr("title");
  if (explicitTitle) {
    return normalizeText(explicitTitle);
  }

  const rowDates = $field
    .find(".date_row")
    .map((_: number, el: any) => normalizeText(cheerio.load(el).text()))
    .toArray()
    .filter((value: string) => value && !/not set/i.test(value));

  if (rowDates.length > 0) {
    return rowDates[0];
  }

  const text = extractFieldValue($field);
  return text && !/not set/i.test(text) ? text : null;
}

function extractReadingSessionId(className: string): string {
  const match = className.match(
    /date_(?:started|read)_([A-Za-z0-9_]+)/i
  );
  return match ? match[1] : "";
}

function parseReadingSessions($: any, row: any) {
  const sessions = new Map<
    string,
    { sessionId: string; dateStarted: string | null; dateRead: string | null }
  >();

  row.find("td.field.date_started .editable_date").each((_: number, el: any) => {
    const node = $(el);
    const className = node.attr("class") || "";
    const sessionId = extractReadingSessionId(className) || `started_${_}`;
    const dateStarted = normalizeText(node.find(".date_started_value").text());

    if (!dateStarted || /not set/i.test(dateStarted)) {
      return;
    }

    const existing = sessions.get(sessionId) || {
      sessionId,
      dateStarted: null,
      dateRead: null,
    };
    existing.dateStarted = dateStarted;
    sessions.set(sessionId, existing);
  });

  row.find("td.field.date_read .editable_date").each((_: number, el: any) => {
    const node = $(el);
    const className = node.attr("class") || "";
    const sessionId = extractReadingSessionId(className) || `read_${_}`;
    const dateRead = normalizeText(node.find(".date_read_value").text());

    if (!dateRead || /not set/i.test(dateRead)) {
      return;
    }

    const existing = sessions.get(sessionId) || {
      sessionId,
      dateStarted: null,
      dateRead: null,
    };
    existing.dateRead = dateRead;
    sessions.set(sessionId, existing);
  });

  return Array.from(sessions.values()).filter(
    (session) => session.dateStarted || session.dateRead
  );
}

function parseStarRating($field: any): number | null {
  if (!$field || $field.length === 0) {
    return null;
  }

  const stars = $field.find(".staticStar");
  if (!stars.length) {
    return null;
  }

  const activeStars = stars
    .toArray()
    .filter((el: any) => (el.attribs?.class || "").includes("p10")).length;

  return activeStars > 0 ? activeStars : 0;
}

function parseUserIdentifier(identifier: string): string {
  if (/^\d+$/.test(identifier)) {
    return identifier;
  }

  if (identifier.startsWith("http")) {
    const reviewListMatch = identifier.match(/\/review\/list\/(\d+)/);
    if (reviewListMatch) {
      return reviewListMatch[1];
    }

    const userShowMatch = identifier.match(/\/user\/show\/(\d+)/);
    if (userShowMatch) {
      return userShowMatch[1];
    }
  }

  const slugMatch = identifier.match(/^(\d+)/);
  return slugMatch ? slugMatch[1] : identifier;
}

function parseSortStateFromHeader($: any) {
  const activeHeader = $("#booksHeader th.header.field").filter((_: number, el: any) => {
    const node = $(el);
    return node.find("img[alt*='arrow' i]").length > 0;
  }).first();

  if (!activeHeader.length) {
    return { sort: null, order: null };
  }

  const sort = normalizeText(activeHeader.attr("alt") || "") || null;
  const href =
    activeHeader.find("a[href*='sort=']").first().attr("href") ||
    activeHeader.find("a").first().attr("href") ||
    "";

  if (!href) {
    return { sort, order: null };
  }

  const resolvedHref = href.startsWith("http")
    ? href
    : `https://www.goodreads.com${href}`;
  const order = new URL(resolvedHref).searchParams.get("order");

  return {
    sort,
    order: order === "a" || order === "d" ? order : null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; listName: string }> }
) {
  try {
    await API_CONFIG.importRateLimit.checkImport(req, "get_user_list");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    const { slug, listName } = await params;
    const { searchParams } = new URL(req.url);

    const resolvedUserId = parseUserIdentifier(decodeURIComponent(slug));
    const shelf = decodeURIComponent(listName);
    const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    const perPage = Math.max(
      1,
      Math.min(100, Number(searchParams.get("per_page") || "100") || 100)
    );
    const sort = searchParams.get("sort") || "";
    const rawOrder = searchParams.get("order") || "";
    const order = rawOrder === "a" || rawOrder === "d" ? rawOrder : "";

    const cacheKey = generateCacheKey(req, "get_user_list", {
      slug: resolvedUserId,
      listName: shelf,
      page: String(page),
      per_page: String(perPage),
      sort,
      order,
    });
    const cachedData = await getCachedResponse(cacheKey);

    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }

    const scrapeParams = new URLSearchParams({
      utf8: "✓",
      shelf,
      per_page: String(perPage),
      page: String(page),
    });
    if (sort) {
      scrapeParams.set("sort", sort);
    }
    if (order) {
      scrapeParams.set("order", order);
    }

    const scrapeURL = `https://www.goodreads.com/review/list/${resolvedUserId}?${scrapeParams.toString()}`;
    const response = await fetchWithConfig(scrapeURL);
    const htmlString = await response.text();
    const $ = cheerio.load(htmlString);

    if ($("#privateProfile").length > 0) {
      const privateResponse = NextResponse.json(
        { error: "Private Profile" },
        { status: 403 }
      );
      privateResponse.headers.set("Cache-Control", "no-store");
      return privateResponse;
    }

    const booksTable = $("#books.table.stacked, table#books").first();
    const rows = booksTable.find(
      "tbody#booksBody tr.bookalike.review, tbody#booksBody tr[id^='review_']"
    );

    const books = rows
      .map((_: number, el: any) => {
        const row = $(el);
        const reviewId = (row.attr("id") || "").replace(/^review_/, "");
        const readingSessions = parseReadingSessions($, row);

        const titleLink = row.find("td.field.title a").first();
        const authorLink = row.find("td.field.author a").first();
        const coverImage = row.find("td.field.cover img").first();
        const titleUrl = toAbsoluteGoodreadsUrl(titleLink.attr("href") || "");
        const authorUrl = toAbsoluteGoodreadsUrl(authorLink.attr("href") || "");

        return {
          reviewId,
          bookId: extractInteger(titleUrl)?.toString() || "",
          title: normalizeText(titleLink.text()),
          bookUrl: titleUrl,
          cover: coverImage.attr("src") || "",
          author: normalizeText(authorLink.text()),
          authorUrl,
          isbn: extractFieldValue(row.find("td.field.isbn").first()) || null,
          isbn13: extractFieldValue(row.find("td.field.isbn13").first()) || null,
          asin: extractFieldValue(row.find("td.field.asin").first()) || null,
          pages: extractInteger(extractFieldValue(row.find("td.field.num_pages").first())),
          avgRating: extractDecimal(
            extractFieldValue(row.find("td.field.avg_rating").first())
          ),
          numRatings: extractInteger(
            extractFieldValue(row.find("td.field.num_ratings").first())
          ),
          datePublished:
            extractFieldValue(row.find("td.field.date_pub").first()) || null,
          datePublishedEdition:
            extractFieldValue(row.find("td.field.date_pub_edition").first()) || null,
          userRating: parseStarRating(row.find("td.field.rating").first()),
          review: parseReviewField(row.find("td.field.review").first()),
          commentsCount: extractInteger(
            extractFieldValue(row.find("td.field.comments").first())
          ),
          votesCount: extractInteger(
            extractFieldValue(row.find("td.field.votes").first())
          ),
          readCount: extractInteger(
            extractFieldValue(row.find("td.field.read_count").first())
          ),
          dateStarted:
            readingSessions.length > 0
              ? readingSessions.map((session) => session.dateStarted).filter(Boolean)
              : parseFieldDate(row.find("td.field.date_started").first()),
          dateRead:
            readingSessions.length > 0
              ? readingSessions.map((session) => session.dateRead).filter(Boolean)
              : parseFieldDate(row.find("td.field.date_read").first()),
          readingSessions,
          dateAdded: parseFieldDate(row.find("td.field.date_added").first()),
          owned: Boolean(extractFieldValue(row.find("td.field.owned").first())),
          format: extractFieldValue(row.find("td.field.format").first()) || null,
          reviewUrl: toAbsoluteGoodreadsUrl(
            row
              .find("td.field.actions a[href*='/review/show/']")
              .first()
              .attr("href") || ""
          ),
        };
      })
      .toArray();

    const perPageFromHtml = Number($("#pagestuff #per_page option:selected").val() || 0) || null;
    const currentPageFromHtml =
      Number($("#pagestuff #reviewPagination em.current").first().text().trim() || 0) || null;
    const { sort: sortFromHeader, order: orderFromHeader } = parseSortStateFromHeader($);
    const sortFromHtml =
      normalizeText(
        $("#pagestuff #sort option:selected").first().attr("value") ||
          $("#pagestuff #sort option:selected").first().text() ||
          ""
      ) || null;
    const orderFromHtml =
      normalizeText(
        $("#pagestuff #sortForm input[name='order']:checked").first().attr("value") || ""
      ) || null;
    const infiniteStatusText = normalizeText($("#pagestuff #infiniteStatus").text());
    const infiniteStatusMatch = infiniteStatusText.match(/(\d+)\s+of\s+(\d+)\s+loaded/i);
    const totalItems = infiniteStatusMatch ? Number(infiniteStatusMatch[2]) : null;
    const paginationLinks = $("#pagestuff #reviewPagination a, #pagestuff a[href*='page=']");
    const visiblePageNumbers = paginationLinks
      .map((_: number, el: any) => {
        const href = $(el).attr("href") || "";
        const match = href.match(/[?&]page=(\d+)/);
        return match ? Number(match[1]) : null;
      })
      .toArray()
      .filter((value: number | null) => Number.isFinite(value));

    const hasNextPage =
      $("#reviewPagination a.next_page").length > 0 ||
      $("#pagestuff a.next_page").length > 0;
    const hasPreviousPage =
      $("#reviewPagination a.previous_page").length > 0 ||
      $("#pagestuff a.previous_page").length > 0;

    const resolvedPerPage = perPageFromHtml || perPage;
    const resolvedCurrentPage = currentPageFromHtml || page;
    const resolvedSort = sortFromHeader || sortFromHtml || sort || null;
    const resolvedOrder = orderFromHtml || orderFromHeader || order || null;
    let totalPages: number | null = null;
    if (totalItems && resolvedPerPage > 0) {
      totalPages = Math.ceil(totalItems / resolvedPerPage);
    } else if (visiblePageNumbers.length > 0 && !hasNextPage) {
      totalPages = Math.max(...visiblePageNumbers);
    } else if (
      visiblePageNumbers.length > 0 &&
      currentPageFromHtml &&
      Math.max(...visiblePageNumbers) >= currentPageFromHtml
    ) {
      totalPages = Math.max(...visiblePageNumbers);
    } else if (!hasNextPage && books.length < resolvedPerPage) {
      totalPages = resolvedCurrentPage;
    }

    const responseData = {
      success: true,
      scrapedURL: scrapeURL,
      user: {
        id: resolvedUserId,
      },
      list: {
        name: shelf,
        sort: resolvedSort,
        order: resolvedOrder,
      },
      pagination: {
        currentPage: resolvedCurrentPage,
        perPage: resolvedPerPage,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      books,
      lastScraped: new Date().toISOString(),
    };

    await setCachedResponse(cacheKey, responseData);

    const apiResponse = NextResponse.json(responseData);
    apiResponse.headers.set("X-Cache", "MISS");
    return apiResponse;
  } catch (error) {
    const errorResponse = NextResponse.json(
      {
        success: false,
        status: "Error - Invalid Query",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 404 }
    );
    errorResponse.headers.set("Cache-Control", "no-store");
    return errorResponse;
  }
}
