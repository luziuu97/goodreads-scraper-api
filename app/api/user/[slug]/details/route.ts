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

function readInfoValue($: any, label: string): string {
  const row = $(".infoBoxRowTitle")
    .filter((_: number, el: any) => normalizeText($(el).text()) === label)
    .first()
    .next(".infoBoxRowItem");

  if (!row.length) {
    return "";
  }

  return normalizeText(row.text());
}

function readInfoNode($: any, label: string) {
  return $(".infoBoxRowTitle")
    .filter((_: number, el: any) => normalizeText($(el).text()) === label)
    .first()
    .next(".infoBoxRowItem");
}

function parseDetails(detailsText: string) {
  const parts = detailsText
    .split(",")
    .map((value) => normalizeText(value))
    .filter(Boolean);

  let age: number | null = null;
  let gender = "";
  const remainingParts: string[] = [];

  for (const part of parts) {
    const ageMatch = part.match(/^Age\s+(\d{1,3})$/i);
    if (ageMatch) {
      age = Number(ageMatch[1]);
      continue;
    }

    if (!gender && /^(male|female|non-binary|nonbinary|other)$/i.test(part)) {
      gender = part;
      continue;
    }

    remainingParts.push(part);
  }

  return {
    age,
    gender,
    location: normalizeText(remainingParts.join(", ")),
    raw: detailsText,
  };
}

function parseGoodreadsUsername(profileUrl: string): string {
  if (!profileUrl) {
    return "";
  }

  try {
    const url = new URL(profileUrl.startsWith("http") ? profileUrl : `https://${profileUrl}`);
    return normalizeText(url.pathname.replace(/^\/+|\/+$/g, ""));
  } catch {
    return "";
  }
}

function parseFavoriteBooks(favoriteBooksText: string): string[] {
  if (!favoriteBooksText) {
    return [];
  }

  return [favoriteBooksText];
}

function extractNumberValue(text: string): number | null {
  const match = normalizeText(text).match(/(\d[\d,]*\.?\d*)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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

function extractBookIdFromUrl(bookUrl: string): string {
  const match = bookUrl.match(/\/book\/show\/(\d+)/i);
  return match ? match[1] : "";
}

function extractProgressCounts(text: string): {
  readCount: number | null;
  targetCount: number | null;
} {
  const normalized = normalizeText(text);
  const ofMatch = normalized.match(/read\s+(\d+)\s+of\s+(\d+)\s+books?/i);
  if (ofMatch) {
    return {
      readCount: Number(ofMatch[1]),
      targetCount: Number(ofMatch[2]),
    };
  }

  const goalMatch = normalized.match(/read\s+(\d+)\s+books?\s+of\s+your\s+goal\s+of\s+(\d+)/i);
  if (goalMatch) {
    return {
      readCount: Number(goalMatch[1]),
      targetCount: Number(goalMatch[2]),
    };
  }

  return {
    readCount: null,
    targetCount: null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await API_CONFIG.importRateLimit.checkImport(req, "get_user_details_metadata");
  } catch {
    const rateLimitResponse = NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  try {
    const { slug } = await params;
    const cacheKey = generateCacheKey(req, "get_user_details_metadata", { slug });
    const cachedData = await getCachedResponse(cacheKey);

    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set("X-Cache", "HIT");
      return cachedResponse;
    }

    const scrapeURL = `https://www.goodreads.com/user/show/${slug}`;
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

    const signinPrompt = normalizeText($("body").text()).includes(
      "Sign in to Goodreads to learn more about"
    );
    if (signinPrompt) {
      const authResponse = NextResponse.json(
        {
          success: false,
          error: "Authentication required. Goodreads session cookie is missing or invalid.",
        },
        { status: 401 }
      );
      authResponse.headers.set("Cache-Control", "no-store");
      return authResponse;
    }

    const name = normalizeText(
      $("h1.userProfileName")
        .first()
        .clone()
        .find("a")
        .remove()
        .end()
        .text()
    );

    const detailsText = readInfoValue($, "Details");
    const details = parseDetails(detailsText);
    const profileImage =
      $(".leftAlignedProfilePicture .profilePictureIcon").attr("src") ||
      $(".userPagePhoto img").attr("src") ||
      $(".profileImage").attr("src") ||
      "";

    const website =
      $(".userProfileWebsite").attr("href") ||
      readInfoNode($, "Website").find("a").attr("href") ||
      "";

    const birthday = readInfoValue($, "Birthday");
    const activityText = readInfoValue($, "Activity");
    const joinedMatch = activityText.match(/Joined in (.*?)(?:,|$)/i);
    const lastActiveMatch = activityText.match(/last active (.*)$/i);

    const favoriteBooks = parseFavoriteBooks(readInfoValue($, "Favorite Books"));
    const bioContainer = readInfoNode($, "About Me");
    const bio = normalizeText(
      bioContainer.find("span[style*='display:none']").first().text() ||
        bioContainer.find("span[id^='freeText']").last().text() ||
        bioContainer.text()
    );
    const profileUrl = normalizeText($("div.greyText.smallText").last().text());
    const username = parseGoodreadsUsername(profileUrl);
    const joinDate = joinedMatch ? normalizeText(joinedMatch[1]) : "";
    const lastActive = lastActiveMatch ? normalizeText(lastActiveMatch[1]) : "";
    const profileStatsBox = $(".profilePageUserStatsInfo").first();
    const totalRatings = extractNumberValue(
      profileStatsBox.find("a[href*='view=reviews']").first().text()
    );
    const avgRating = extractNumberValue(
      profileStatsBox.find("a").filter((_: number, el: any) => {
        return normalizeText($(el).text()).includes("avg");
      }).first().text()
    );
    const totalReviews = extractNumberValue(
      profileStatsBox.find("a[href*='sort=review']").first().text()
    );
    const photosCount = extractNumberValue(
      profileStatsBox.find("a[href*='/photo/user/']").last().text()
    );
    const shelves = $("#shelves a.userShowPageShelfListItem")
      .map((_: number, el: any) => {
        const shelfNode = $(el);
        const href = shelfNode.attr("href") || "";
        const text = normalizeText(shelfNode.text());
        const count = extractNumberValue(text);
        const shelfMatch = href.match(/[?&]shelf=([^&]+)/i);
        const name = shelfMatch
          ? decodeURIComponent(shelfMatch[1])
          : text.replace(/\(\d[\d,]*\)\s*$/, "").trim();

        return {
          name,
          count,
          url: toAbsoluteGoodreadsUrl(href),
        };
      })
      .toArray();
    const currentlyReadingBooks = $("#currentlyReadingReviews .Updates")
      .map((_: number, el: any) => {
        const bookNode = $(el);
        const bookUrl = toAbsoluteGoodreadsUrl(
          bookNode.find("a.bookTitle").first().attr("href") ||
            bookNode.find(".firstcol a").first().attr("href") ||
            ""
        );
        const authorUrl = toAbsoluteGoodreadsUrl(
          bookNode.find("a.authorName").first().attr("href") || ""
        );
        const shelfLinks = bookNode
          .find(".whos-review a.actionLinkLite")
          .map((__: number, shelfEl: any) => normalizeText($(shelfEl).text()))
          .toArray()
          .filter(Boolean);

        return {
          bookId: extractBookIdFromUrl(bookUrl),
          title: normalizeText(bookNode.find("a.bookTitle").first().text()),
          author: normalizeText(bookNode.find("a.authorName").first().text()),
          cover: bookNode.find(".firstcol img").first().attr("src") || "",
          shelves: shelfLinks,
          readingDate: normalizeText(
            bookNode.find(".updatedTimestamp").first().text()
          ),
          bookUrl,
          authorUrl,
        };
      })
      .toArray()
      .filter((book: any) => book.title || book.bookUrl);
    const currentChallengeModule = $("#hp_year_challenge .yearChallengeModule").first();
    const currentChallengeTitle = normalizeText(
      $(".gradientHeaderContainer h2 a.stacked").first().text() ||
        currentChallengeModule.find(".challengeTitle").first().text()
    );
    const currentChallengeBooksText = normalizeText(
      currentChallengeModule.find(".challengeBooksRead").first().text()
    );
    const progressCounts = extractProgressCounts(currentChallengeBooksText);
    const currentChallengePercentageText = normalizeText(
      currentChallengeModule.find(".progressStats").first().text()
    );
    const currentChallengeYear =
      extractNumberValue(
        $("#hp_year_challenge .badgeYear .yearHeader").first().text()
      );
    const readingChallenge =
      currentChallengeModule.length > 0
        ? {
            year: currentChallengeYear,
            title: currentChallengeTitle,
            readCount: progressCounts.readCount,
            targetCount: progressCounts.targetCount,
            percentage: currentChallengePercentageText,
            progressText: normalizeText(
              currentChallengeModule.find(".challengeProgressText").first().text()
            ),
            booksText: currentChallengeBooksText,
            url: toAbsoluteGoodreadsUrl(
              currentChallengeModule.find(".viewChallenge").first().attr("href") ||
                currentChallengeModule.find(".challengeBooksRead").first().attr("href") ||
                $(".gradientHeaderContainer h2 a.stacked").first().attr("href") ||
                ""
            ),
          }
        : null;

    const responseData = {
      success: true,
      scrapedURL: scrapeURL,
      user: {
        slug,
        profileImage,
        name,
        username,
        age: details.age,
        gender: details.gender,
        location: details.location,
        website,
        profileUrl,
        joinDate,
        lastActive,
        birthday,
        bio,
        favoriteBooks,
        stats: {
          avgRating,
          totalRatings,
          totalReviews,
          photosCount,
        },
        currentlyReadingBooks,
        shelves,
        readingChallenge,
        lastScraped: new Date().toISOString(),
      },
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
