const cheerio = require("cheerio");

/**
 * Extract number from text (handles commas and other formatting)
 */
function extractNumber(text: string): number {
  if (!text) return 0;
  const cleaned = text.trim().replace(/,/g, "");
  const match = cleaned.match(/\d+/);
  return match ? parseInt(match[0]) : 0;
}

/**
 * Parse the Year in Books HTML for 2025
 */
export function parseYear2025(htmlString: string, yearNum: number, userId: string) {
  const $ = cheerio.load(htmlString);
  
  // Check for private profile or access denied
  const privateProfile = $("#privateProfile").length > 0;
  if (privateProfile) {
    return { error: "Private Profile", status: 403 };
  }
  
  // Extract data from heroContent section
  const heroContent = $(".heroContent");
  let readingChallenge = null;
  
  if (heroContent.length > 0) {
    // Extract year from banner
    const bannerYearText = $(".herobannerYearText").text().trim();
    const extractedYear = bannerYearText ? parseInt(bannerYearText) : yearNum;
    
    // Extract user name
    const userName = $(".headerName").text().trim() || "";
    
    // Extract counts from heroImageContainer
    const counts = $(".heroImageContainer__count");
    let pagesRead = 0;
    let booksRead = 0;
    
    // The structure has: pages count, avatar, books count
    // So first count is pages, third count is books
    counts.each((index: number, el: any) => {
      const $count = $(el);
      const countText = $count.text().trim();
      const countValue = extractNumber(countText);
      
      // Check the label to determine what this count represents
      const $parent = $count.parent();
      const label = $parent.find(".heroImageContainer__countLabel").text().trim().toLowerCase();
      
      if (label.includes("pages")) {
        pagesRead = countValue;
      } else if (label.includes("books")) {
        booksRead = countValue;
      }
    });
    
    // If we didn't find by label, use position (first = pages, last = books)
    if (pagesRead === 0 && booksRead === 0 && counts.length >= 2) {
      pagesRead = extractNumber($(counts[0]).text());
      booksRead = extractNumber($(counts[counts.length - 1]).text());
    }
    
    // Build challenge URL
    const challengeUrl = `/user/year_in_books/${extractedYear}/${userId}`;
    
    // Extract shortest book
    const shortestBookContainer = $("#yyibShortestBookHeading").closest(".yyibBooksLockup__bookContainer");
    let shortestBook = null;
    if (shortestBookContainer.length > 0) {
      const $link = shortestBookContainer.find("a.gr-mediaFlexbox__media");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      const shortestPages = extractNumber(shortestBookContainer.find(".yyibBooksLockup__number").text());
      shortestBook = {
        bookId: bookId,
        title: titleParts[0] || "",
        author: titleParts[1] || "",
        pages: shortestPages,
        cover: $link.find("img").attr("src") || "",
        url: href ? `https://www.goodreads.com${href}` : "",
      };
    }
    
    // Extract longest book
    const longestBookContainer = $("#yyibLongestBookHeading").closest(".yyibBooksLockup__bookContainer");
    let longestBook = null;
    if (longestBookContainer.length > 0) {
      const $link = longestBookContainer.find("a.gr-mediaFlexbox__media");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      const longestPages = extractNumber(longestBookContainer.find(".yyibBooksLockup__number").text());
      longestBook = {
        bookId: bookId,
        title: titleParts[0] || "",
        author: titleParts[1] || "",
        pages: longestPages,
        cover: $link.find("img").attr("src") || "",
        url: href ? `https://www.goodreads.com${href}` : "",
      };
    }
    
    // Extract average book length
    const averageLengthText = $(".yyibAverageBookLengthData__pageCount").first().text().trim();
    const averageBookLength = extractNumber(averageLengthText);
    
    // Extract most shelved book
    const mostShelvedContainer = $("#yyibMostPopularHeading").closest(".yyibBooksLockup__bookContainer");
    let mostShelved = null;
    if (mostShelvedContainer.length > 0) {
      const $link = mostShelvedContainer.find("a.gr-mediaFlexbox__media");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      const shelvedCountText = mostShelvedContainer.find(".yyibBooksLockup__number").text().trim().replace(/,/g, "").replace(/<wbr>/g, "");
      const shelvedCount = extractNumber(shelvedCountText);
      mostShelved = {
        bookId: bookId,
        title: titleParts[0] || "",
        author: titleParts[1] || "",
        shelvedCount: shelvedCount,
        cover: $link.find("img").attr("src") || "",
        url: href ? `https://www.goodreads.com${href}` : "",
      };
    }
    
    // Extract least shelved book
    const leastShelvedContainer = $("#yyibLeastPopularHeading").closest(".yyibBooksLockup__bookContainer");
    let leastShelved = null;
    if (leastShelvedContainer.length > 0) {
      const $link = leastShelvedContainer.find("a.gr-mediaFlexbox__media");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      const shelvedCountText = leastShelvedContainer.find(".yyibBooksLockup__number").text().trim();
      const shelvedCount = extractNumber(shelvedCountText);
      leastShelved = {
        bookId: bookId,
        title: titleParts[0] || "",
        author: titleParts[1] || "",
        shelvedCount: shelvedCount,
        cover: $link.find("img").attr("src") || "",
        url: href ? `https://www.goodreads.com${href}` : "",
      };
    }
    
    // Extract average rating
    const averageRatingText = $(".yyibAverageRatingData__pageCount").first().text().trim();
    const averageRating = averageRatingText ? parseFloat(averageRatingText) : null;
    
    // Extract highest rated book on Goodreads
    const highestRatedContainer = $(".crowdFavoriteWidget");
    let highestRated = null;
    if (highestRatedContainer.length > 0) {
      const $link = highestRatedContainer.find("a.yyibBooksLockup__bookImageContainer");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      const ratingText = highestRatedContainer.find(".yyibCrowdFavoriteRatingLabel").text().trim();
      const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
      highestRated = {
        bookId: bookId,
        title: titleParts[0] || "",
        author: titleParts[1] || "",
        rating: rating,
        cover: $link.find("img").attr("src") || "",
        url: href ? `https://www.goodreads.com${href}` : "",
      };
    }
    
    // Extract first review of the year
    const firstReviewContainer = $(".yyibFirstLastReview");
    let firstReview = null;
    if (firstReviewContainer.length > 0) {
      const $link = firstReviewContainer.find("a.yyibFirstLastReview__bookImageContainer");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      
      // Extract rating from stars
      const $stars = firstReviewContainer.find(".staticStars");
      let rating = null;
      if ($stars.length > 0) {
        const starTitle = $stars.attr("title") || "";
        // Map star titles to ratings
        if (starTitle.includes("amazing")) rating = 5;
        else if (starTitle.includes("really liked")) rating = 4;
        else if (starTitle.includes("liked")) rating = 3;
        else if (starTitle.includes("ok")) rating = 2;
        else if (starTitle.includes("did not like")) rating = 1;
        
        // Alternative: count filled stars
        if (rating === null) {
          const filledStars = $stars.find(".staticStar_flat.p10").length;
          rating = filledStars > 0 ? filledStars : null;
        }
      }
      
      // Extract review text (get full text if available, otherwise truncated)
      // Look for any review text container
      let reviewText = "";
      const $fullText = firstReviewContainer.find("[id^='freeTextreview']").not("[id*='Container']");
      const $truncatedText = firstReviewContainer.find("[id^='freeTextContainerreview']");
      
      if ($fullText.length > 0) {
        reviewText = $fullText.text().trim();
      } else if ($truncatedText.length > 0) {
        reviewText = $truncatedText.text().trim();
      } else {
        // Fallback: get text from yyibFirstLastReviewText
        reviewText = firstReviewContainer.find(".yyibFirstLastReviewText").text().trim();
        // Remove "more" link text
        reviewText = reviewText.replace(/\.\.\.more$/, "").trim();
      }
      
      firstReview = {
        bookId: bookId,
        title: titleParts[0] || "",
        author: titleParts[1] || "",
        rating: rating,
        reviewText: reviewText,
        cover: $link.find("img").attr("src") || "",
        url: href ? `https://www.goodreads.com${href}` : "",
      };
    }
    
    // Extract all books from cover view
    const books: Array<{
      bookId: string;
      title: string;
      author: string;
      cover: string;
      url: string;
      userRating: number | null;
    }> = [];
    
    $(".bookCovers .bookTooltip").each((_: number, el: any) => {
      const $el = $(el);
      const $link = $el.find("a");
      const href = $link.attr("href") || "";
      const bookIdMatch = href.match(/\/book\/show\/(\d+)/);
      const bookId = bookIdMatch ? bookIdMatch[1] : "";
      
      const titleAttr = $link.find("img").attr("title") || $link.find("img").attr("alt") || "";
      const titleParts = titleAttr.split(" by ");
      const title = titleParts[0] || "";
      const author = titleParts[1] || "";
      
      const cover = $link.find("img").attr("src") || "";
      
      // Check for user rating (stars on double size covers)
      const $parent = $el.closest(".standardCover, .doubleSizeCover");
      let userRating: number | null = null;
      const $coverStars = $parent.find(".doubleCoverStars .staticStars");
      if ($coverStars.length > 0) {
        const starTitle = $coverStars.attr("title") || "";
        if (starTitle.includes("amazing")) userRating = 5;
        else if (starTitle.includes("really liked")) userRating = 4;
        else if (starTitle.includes("liked")) userRating = 3;
        else if (starTitle.includes("ok")) userRating = 2;
        else if (starTitle.includes("did not like")) userRating = 1;
        
        // Alternative: count filled stars
        if (userRating === null) {
          const filledStars = $coverStars.find(".staticStar_flat.p10").length;
          userRating = filledStars > 0 ? filledStars : null;
        }
      }
      
      if (bookId && title) {
        books.push({
          bookId,
          title,
          author,
          cover,
          url: href.startsWith("http") ? href : `https://www.goodreads.com${href}`,
          userRating,
        });
      }
    });
    
    readingChallenge = {
      readCount: booksRead,
      pagesRead: pagesRead,
      progressText: `${booksRead} books and ${pagesRead.toLocaleString()} pages read in ${extractedYear}`,
      url: `https://www.goodreads.com${challengeUrl}`,
      year: extractedYear,
      userName: userName,
      stats: {
        averageBookLength: averageBookLength,
        averageRating: averageRating,
        shortestBook: shortestBook,
        longestBook: longestBook,
        mostShelved: mostShelved,
        leastShelved: leastShelved,
        highestRated: highestRated,
        firstReview: firstReview,
      },
      books: books,
    };
  } else {
    // No Year in Books data found
    readingChallenge = {
      readCount: 0,
      pagesRead: 0,
      progressText: "No reading data found for this year",
      url: "",
      year: yearNum,
      userName: "",
      stats: null,
      books: [],
    };
  }
  
  return { readingChallenge };
}


