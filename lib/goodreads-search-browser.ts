import { API_CONFIG, getSessionCookie } from "@/lib/api-config";

type PuppeteerModule = typeof import("puppeteer");
type Browser = import("puppeteer").Browser;
type CookieParam = import("puppeteer").CookieParam;
type LaunchOptions = import("puppeteer").LaunchOptions;

const SEARCH_RESULTS_SELECTOR =
  "table.tableList > tbody > tr[itemtype='http://schema.org/Book']";
const CHALLENGE_PATTERNS = [
  "awswafintegration",
  "challenge-container",
  "awswaf.com",
  "captcha",
  "verify you are human",
  "verify you're a human",
  "access denied",
  "request blocked",
  "cloudflare",
];

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

export async function fetchGoodreadsSearchHtmlWithBrowser(
  url: string
): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
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

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const outcome = await page
      .waitForFunction(
        (selector, challengePatterns) => {
          const html = document.documentElement.outerHTML.toLowerCase();

          if (document.querySelector(selector)) {
            return "results";
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
        CHALLENGE_PATTERNS
      )
      .then((handle) => handle.jsonValue() as Promise<string>);

    if (outcome !== "results") {
      const currentUrl = page.url();
      const title = await page.title();
      const htmlSnippet = (await page.content())
        .replace(/\s+/g, " ")
        .slice(0, 500);

      throw new Error(
        `Browser reached ${outcome} state at ${currentUrl} (title: ${title}). HTML snippet: ${htmlSnippet}`
      );
    }

    await page.waitForFunction(
      (selector) => {
        return document.querySelectorAll(selector).length > 0;
      },
      { timeout: 5000 },
      SEARCH_RESULTS_SELECTOR
    );

    return await page.content();
  } finally {
    await page.close().catch(() => undefined);
  }
}
