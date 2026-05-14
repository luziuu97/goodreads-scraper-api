import { API_CONFIG, getSessionCookie } from "@/lib/api-config";

type PuppeteerModule = typeof import("puppeteer");
type Browser = import("puppeteer").Browser;
type Page = import("puppeteer").Page;
type CookieParam = import("puppeteer").CookieParam;
type LaunchOptions = import("puppeteer").LaunchOptions;

const SEARCH_RESULTS_SELECTOR =
  "table.tableList > tbody > tr[itemtype='http://schema.org/Book']";
const NO_RESULTS_TEXT = "no results.";
const CHALLENGE_PATTERNS = [
  "in order to continue, we need to verify that you're not a robot"
];
const BOOK_DETAILS_PATH_PATTERN = /\/book\/show\/\d+/;
const CHALLENGE_RETRY_COUNT = 3;
const CHALLENGE_RETRY_DELAY_MS = 1500;

declare global {
  // Reuse one browser per server process to avoid paying launch cost on every blocked request.
  var __goodreadsBrowserPromise: Promise<Browser> | undefined;
}

function parseCookieHeader(cookieHeader?: string): CookieParam[] {
  if (!cookieHeader) return [];

  const cookies: CookieParam[] = [];

  for (const segment of cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
  ) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) continue;

    const name = segment.slice(0, eqIndex).trim();
    const value = segment.slice(eqIndex + 1).trim();
    if (!name) continue;

    cookies.push({
      name,
      value,
      domain: ".goodreads.com",
      path: "/",
      httpOnly: false,
      secure: true,
    });
  }

  return cookies;
}

async function importPuppeteer(): Promise<PuppeteerModule> {
  return import("puppeteer");
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await importPuppeteer();

  const launchConfigs: Array<{ name: string; options: LaunchOptions }> = [
    {
      name: "bundled-chromium",
      options: {
        headless: true,
        timeout: 30000,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
    {
      name: "chrome-channel",
      options: {
        headless: true,
        timeout: 30000,
        channel: "chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
  ];

  let lastError: unknown = null;

  for (const config of launchConfigs) {
    try {
      return await puppeteer.launch(config.options);
    } catch (error) {
      lastError = error;
      console.error(`Puppeteer launch strategy "${config.name}" failed`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to launch Puppeteer browser");
}

async function getBrowser(): Promise<Browser> {
  if (!global.__goodreadsBrowserPromise) {
    global.__goodreadsBrowserPromise = launchBrowser().catch((error) => {
      global.__goodreadsBrowserPromise = undefined;
      throw error;
    });
  }

  return global.__goodreadsBrowserPromise;
}

async function prepareSearchPage(page: Page): Promise<void> {
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(API_CONFIG.userAgent);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  const sessionCookie = getSessionCookie();
  const cookies = parseCookieHeader(sessionCookie);
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

async function runSearchAttempt(
  browser: Browser,
  url: string
): Promise<{ html: string; finalUrl: string; outcome: string }> {
  const page = await browser.newPage();

  try {
    await prepareSearchPage(page);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const outcome = await page
      .waitForFunction(
        (selector, challengePatterns, noResultsText, bookPathSource) => {
          const html = document.documentElement.outerHTML.toLowerCase();
          const bookPathPattern = new RegExp(bookPathSource);

          if (bookPathPattern.test(window.location.pathname)) {
            return "book";
          }

          if (document.querySelector(selector)) {
            return "results";
          }

          if (html.includes(noResultsText)) {
            return "no_results";
          }

          if (challengePatterns.some((pattern) => html.includes(pattern))) {
            return "challenge";
          }

          if (
            window.location.pathname.includes("/user/sign_in") ||
            html.includes("sign in to continue")
          ) {
            return "signin";
          }

          return false;
        },
        { timeout: 45000, polling: 1000 },
        SEARCH_RESULTS_SELECTOR,
        CHALLENGE_PATTERNS,
        NO_RESULTS_TEXT,
        BOOK_DETAILS_PATH_PATTERN.source
      )
      .then((handle) => handle.jsonValue() as Promise<string>);

    if (outcome === "results") {
      await page.waitForFunction(
        (selector) => {
          return document.querySelectorAll(selector).length > 0;
        },
        { timeout: 5000 },
        SEARCH_RESULTS_SELECTOR
      );
    }

    return {
      html: await page.content(),
      finalUrl: page.url(),
      outcome,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGoodreadsSearchHtmlWithBrowser(
  url: string
): Promise<{ html: string; finalUrl: string }> {
  const browser = await getBrowser();

  let lastAttempt: { html: string; finalUrl: string; outcome: string } | null = null;

  for (let attempt = 1; attempt <= CHALLENGE_RETRY_COUNT + 1; attempt += 1) {
    lastAttempt = await runSearchAttempt(browser, url);

    if (
      lastAttempt.outcome === "no_results" ||
      lastAttempt.outcome === "book" ||
      lastAttempt.outcome === "results"
    ) {
      return {
        html: lastAttempt.html,
        finalUrl: lastAttempt.finalUrl,
      };
    }

    if (lastAttempt.outcome === "challenge" && attempt <= CHALLENGE_RETRY_COUNT) {
      await sleep(CHALLENGE_RETRY_DELAY_MS);
      continue;
    }

    const htmlSnippet = lastAttempt.html.replace(/\s+/g, " ").slice(0, 500);
    throw new Error(
      `Browser reached ${lastAttempt.outcome} state at ${lastAttempt.finalUrl} after ${attempt} attempt(s). HTML snippet: ${htmlSnippet}`
    );
  }

  throw new Error("Goodreads search failed without a browser outcome");
}
