import { NextRequest, NextResponse } from "next/server";
import { API_CONFIG, fetchWithConfig } from "@/lib/api-config";
import { generateCacheKey, getCachedResponse, setCachedResponse } from "@/lib/redis-cache";
const cheerio = require("cheerio");

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Apply rate limiting
    await API_CONFIG.rateLimit.check(req, "get_user_details");
  } catch {
    const rateLimitResponse = NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
    rateLimitResponse.headers.set('Cache-Control', 'no-store');
    return rateLimitResponse;
  }

  try {
    const { slug } = await params;
    
    // Check Redis cache
    const cacheKey = generateCacheKey(req, "get_user_details", { slug });
    const cachedData = await getCachedResponse(cacheKey);
    
    if (cachedData) {
      const cachedResponse = NextResponse.json(cachedData);
      cachedResponse.headers.set('X-Cache', 'HIT');
      return cachedResponse;
    }
    
    const scrapeURL = `https://www.goodreads.com/user/show/${slug}`;

    const response = await fetchWithConfig(scrapeURL);
    const htmlString = await response.text();
    const $ = cheerio.load(htmlString);

    // Helper function to extract only numbers from text (including decimals)
    const extractNumber = (text: string): string => {
      const match = text.trim().match(/\d+\.?\d*/);
      return match ? match[0] : "";
    };

    const privateProfile = $("#privateProfile").length > 0;
    const userNavbar = $(".personalNav").length > 0;

    let signedUsername = "";
    if (userNavbar) {
      signedUsername = $(".personalNav").find("img").attr("alt") || "";
    }

    if (privateProfile) {
      const privateResponse = NextResponse.json({ error: "Private Profile" }, { status: 403 });
      privateResponse.headers.set('Cache-Control', 'no-store');
      return privateResponse;
    }

    // Extract user profile information
    const profileImage =
      $(".leftAlignedProfilePicture .profilePictureIcon").attr("src") ||
      $(".profileImage").attr("src") || 
      $(".userProfileImage img").attr("src");
    
    // Extract stats from the left profile box
    const profileStatsBox = $(".profilePageUserStatsInfo");
    const totalRatings = extractNumber(profileStatsBox.find("a:contains('ratings')").text());
    const totalReviews = extractNumber(profileStatsBox.find("a:contains('reviews')").text());
    const avgRatingProfile = extractNumber(profileStatsBox.find("a:contains('avg')").text());

    const name =
      $("h1.userProfileName").text().trim() ||
      $(".userProfileName").text().trim();
    const username = $(".userProfileName").text().trim();
    
    // Helper to get text from info box rows
    const getInfoBoxContent = (title: string): any => {
      return $(".infoBoxRowTitle")
        .filter((_: number, el: any) => $(el).text().trim() === title)
        .next(".infoBoxRowItem");
    };

    const a = getInfoBoxContent("Birthday");
    console.log("Birthday", a)

    const location = getInfoBoxContent("Details").text().trim();
    
    const website = $(".userProfileWebsite").attr("href") || // Try specific class first
                    getInfoBoxContent("Website").find("a").attr("href") ||
                    getInfoBoxContent("Website").text().trim();

    const activityText = getInfoBoxContent("Activity").text().trim();
    // "Joined in July 2018, last active this month"
    const joinDateMatch = activityText.match(/Joined in (.*?),/);
    const lastActiveMatch = activityText.match(/last active (.*)/);
    
    const joinDate = joinDateMatch ? joinDateMatch[1].trim() : "";
    const lastActive = lastActiveMatch ? lastActiveMatch[1].trim() : "";

    const birthday = getInfoBoxContent("Birthday").text().trim();

    // Extract user stats - try multiple selectors for different layouts
    const booksRead =
      $("a.actionLinkLite.userShowPageShelfListItem")
        .filter((i: number, el: any) => {
          const href = $(el).attr("href");
          return href && href.includes("shelf=read");
        })
        .first()
        .text()
        .trim()
        .match(/\d+/)?.[0] ||
      extractNumber($(".userStatsBooksRead").text().trim()) ||
      extractNumber($(".userStatsBooksReadText").text().trim());

    const booksToRead =
      $("a.actionLinkLite.userShowPageShelfListItem")
        .filter((i: number, el: any) => {
          const href = $(el).attr("href");
          return href && href.includes("shelf=to-read");
        })
        .first()
        .text()
        .trim()
        .match(/\d+/)?.[0] ||
      extractNumber($(".userStatsBooksToRead .userStatsCount").text().trim()) ||
      extractNumber($(".userStatsBooksToRead").text().trim()) ||
      extractNumber($(".userStatsBooksToReadText").text().trim());
      const currentlyReadingContainer = $("#bodycontainer > div.mainContentContainer > div.mainContent > div.mainContentFloat > div.leftContainer > div")
        .filter((i: number, el: any) => {
          return $(el).text().toUpperCase().includes("IS CURRENTLY READING");
        })
        .first();

      const currentlyReadingBooks = currentlyReadingContainer
        .find(".Updates")
        .map((i: number, el: any) => {
          const $el = $(el);
          const cover = $el.find("img").attr("src");
          const title = $el.find(".bookTitle").text().trim();
          const bookUrl = $el.find(".bookTitle").attr("href");
          const author = $el.find(".authorName").text().trim();
          const authorUrl = $el.find(".authorName").attr("href");
          
          const shelves = $el.find("a[href*='shelf=']")
            .map((_: number, s: any) => $(s).text().trim())
            .toArray();

          const readingDate = $el.find(".updatedTimestamp").text().trim();

          return {
            title,
            bookUrl,
            author,
            authorUrl,
            cover,
            shelves,
            readingDate
          };
        })
        .toArray();
      
      const currentlyReading =
      $("a.actionLinkLite.userShowPageShelfListItem")
        .filter((i: number, el: any) => {
          const href = $(el).attr("href");
          return href && href.includes("shelf=currently-reading");
        })
        .first()
        .text()
        .trim()
        .match(/\d+/)?.[0] ||
      extractNumber(
        $(".userStatsCurrentlyReading .userStatsCount").text().trim()
      ) ||
      extractNumber($(".userStatsCurrentlyReading").text().trim()) ||
      extractNumber($(".userStatsCurrentlyReadingText").text().trim());
    const avgRating = extractNumber(
      $("div.leftAlignedProfilePicture > div > a:nth-child(2)").text().trim() ||
        $(".userStatsAvgRating").text().trim() ||
        $(".userStatsAvgRatingText").text().trim()
    );
    const friendsCount = extractNumber(
      $(
        "#bodycontainer > div.mainContentContainer > div.mainContent > div.mainContentFloat > div.rightContainer > div:nth-child(4) > div.h2Container.gradientHeaderContainer > h2 > a"
      )
        .text()
        .trim() ||
        $(".userStatsFriends").text().trim() ||
        $(".userStatsFriendsText").text().trim()
    );

    // TO-DO: Fix groups count
    const groupsCount = extractNumber(
      $(".userStatsGroups .userStatsCount").text().trim() ||
        $(".userStatsGroups").text().trim() ||
        $(".userStatsGroupsText").text().trim()
    );

    // Extract user bio/description
    const bioContainer = getInfoBoxContent("About Me");
    const bio = bioContainer.find("span[style='display:none']").text().trim() || 
                bioContainer.text().trim();

    // Extract favorite authors - try multiple selectors
    const favoriteAuthors = $(
      ".favoriteAuthors .author, .favoriteAuthors a, .userFavoriteAuthors .author"
    )
      .map((i: number, el: any) => {
        const $el = $(el);
        const name = $el.find(".authorName").text().trim() || $el.text().trim();
        const url = $el.find("a").attr("href") || $el.attr("href");
        const id = i + 1;
        return {
          id: id,
          name: name,
          url: url,
        };
      })
      .toArray();

    // Extract favorite books - try multiple selectors

    const hasFavoriteBooks =
      $("#featured_shelf > div.h2Container.gradientHeaderContainer > h2 > a")
        .length > 0;
    let favoriteBooks: any[] = [];
    if (hasFavoriteBooks) {
      favoriteBooks = $(
        "#featured_shelf > div.bigBoxBody > div > div.imgGrid > a"
      )
        .map((i: number, el: any) => {
          const $el = $(el);
          const img = $el.find("img");
          const title = img.attr("title") || img.attr("alt") || "";
          const cover = img.attr("src");
          const url = $el.attr("href");
          
          // Extract title and author from the title/alt attribute
          const titleParts = title.split(" by ");
          const bookTitle = titleParts[0] || "";
          const author = titleParts[1] || "";
          
          const id = i + 1;
          return {
            id: id,
            title: bookTitle,
            author: author,
            cover: cover,
            url: url,
          };
        })
        .toArray();
    }

    // Extract recent activity - try multiple selectors
    const recentActivity = $(
      ".recentActivity .activityItem, .userActivity .activityItem, .activity .activityItem"
    )
      .map((i: number, el: any) => {
        const $el = $(el);
        const activity =
          $el.find(".activityText").text().trim() || $el.text().trim();
        const date = $el.find(".activityDate").text().trim();
        const id = i + 1;
        return {
          id: id,
          activity: activity,
          date: date,
        };
      })
      .toArray();

    // Extract shelves - try multiple selectors
    const shelves = $("#shelves > div > a")
      .map((i: number, el: any) => {
        const $el = $(el);
        const rawName = $el.text().replace(/\u200e/g, "").trim();
        let name = rawName;
        let count =
          $el.siblings(".shelfCount").text().trim() ||
          $el.parent().find(".shelfCount").text().trim();

        const countMatch = rawName.match(/^([\s\S]+?)\s*\(\s*(\d+)\s*\)$/);

        if (countMatch) {
          name = countMatch[1].trim();
          if (!count) {
            count = countMatch[2];
          }
        }
        
        count = extractNumber(count);
        const url = $el.parent().attr("href") || $el.attr("href");
        const id = i + 1;
        return {
          id: id,
          name: name,
          count: count,
          url: url,
        };
      })
      .toArray();

    // Extract yearly reading challenge
    const challengeEl = $(".yearChallengeModule");
    let readingChallenge = null;

    if (challengeEl.length > 0) {
      const challengeLink = challengeEl.find(".challengeBooksRead");
      const message = challengeLink.text().trim(); // "You have read 55 of 60 books."
      const challengeUrl = challengeLink.attr("href");
      
      // Parse numbers from message like "read 55 of 60"
      const numbers = message.match(/(\d+)/g);
      const readCount = numbers && numbers.length >= 1 ? parseInt(numbers[0]) : 0;
      const targetCount = numbers && numbers.length >= 2 ? parseInt(numbers[1]) : 0;

      // Calculate percentage
      const percentage = targetCount > 0 ? Math.round((readCount / targetCount) * 100) + "%" : "0%";

      // Calculate progress status
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const diff = now.getTime() - start.getTime();
      const oneDay = 1000 * 60 * 60 * 24;
      const dayOfYear = Math.floor(diff / oneDay);
      const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const daysInYear = isLeapYear(now.getFullYear()) ? 366 : 365;
      
      const expectedRead = (targetCount * dayOfYear) / daysInYear;
      const discrepancy = readCount - expectedRead;
      const discrepancyCount = Math.round(Math.abs(discrepancy));
      
      let progressText = "You're on track!";
      if (discrepancy > 1) {
        progressText = `You're ${discrepancyCount} book${discrepancyCount !== 1 ? 's' : ''} ahead of schedule`;
      } else if (discrepancy < -1) {
        progressText = `You're ${discrepancyCount} book${discrepancyCount !== 1 ? 's' : ''} behind schedule`;
      }

      readingChallenge = {
        readCount,
        targetCount,
        percentage,
        progressText,
        url: challengeUrl ? `https://www.goodreads.com${challengeUrl}` : "",
      };
      
      // Fix URL if it's already absolute or starts with /
      if (challengeUrl && challengeUrl.startsWith("http")) {
         readingChallenge.url = challengeUrl;
      }
    }

    const lastScraped = new Date().toISOString();

    const responseData = {
      success: true,
      scrapedURL: scrapeURL,
      //signedUsername,
      user: {
        profileImage,
        slug,
        name,
        username,
        location,
        website,
        joinDate,
        lastActive,
        birthday,
        stats: {
          booksRead,
          booksToRead,
          currentlyReading,
          avgRating: avgRatingProfile || avgRating,
          totalRatings,
          totalReviews,
          friendsCount,
          groupsCount,
        },
        currentlyReading:currentlyReadingBooks,
        bio,
        favoriteAuthors,
        favoriteBooks,
        recentActivity,
        shelves,
        readingChallenge,
        lastScraped,
      },
    };

    // Cache response in Redis for 4 hours
    await setCachedResponse(cacheKey, responseData);

    const apiResponse = NextResponse.json(responseData);
    apiResponse.headers.set('X-Cache', 'MISS');
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
    errorResponse.headers.set('Cache-Control', 'no-store');
    return errorResponse;
  }
}
