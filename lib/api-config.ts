import { env } from "next-runtime-env";
import { rateLimit } from "./rate-limit";

export function normalizeCookieHeader(rawCookie?: string): string | undefined {
  if (!rawCookie) return undefined;

  let value = rawCookie.trim();

  // Remove one layer of wrapping quotes from .env values.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  // Guard against accidental shell interpolation leftovers in pasted values.
  value = value.replace(/\s*=\s*\$1['"]?\s*$/, "").trim();

  // Unescape quoted cookie values from pasted env strings (e.g. \"abc\").
  value = value.replace(/\\"/g, '"');

  // Normalize each cookie segment and strip per-cookie quote wrappers:
  // x-main="abc" -> x-main=abc
  const normalizedPairs = value
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const eqIndex = segment.indexOf("=");
      if (eqIndex === -1) return "";

      const key = segment.slice(0, eqIndex).trim();
      let cookieValue = segment.slice(eqIndex + 1).trim();
      if (!key) return "";

      if (
        (cookieValue.startsWith('"') && cookieValue.endsWith('"')) ||
        (cookieValue.startsWith("'") && cookieValue.endsWith("'"))
      ) {
        cookieValue = cookieValue.slice(1, -1);
      }

      return `${key}=${cookieValue}`;
    })
    .filter(Boolean);

  const normalized = normalizedPairs.join("; ");
  return normalized || undefined;
}

export const API_CONFIG = {
  userAgent: env("NEXT_PUBLIC_USER_AGENT") || 
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
  baseURL: "https://www.goodreads.com",
  publicRateLimit: rateLimit({
    interval: 24 * 60 * 60 * 1000, // 24 hours
    uniqueTokenPerInterval: 500 // Max 500 endpoint+IP buckets per interval
  }),
  importRateLimit: rateLimit({
    interval: 60 * 60 * 1000, // 1 hour
    uniqueTokenPerInterval: 50000 // Max 50k endpoint+IP buckets per interval
  })
};

export function getSessionCookie(): string | undefined {
  return normalizeCookieHeader(
    process.env.GOODREADS_SESSION_COOKIE || env("GOODREADS_SESSION_COOKIE")
  );
}

export function getHardcoverApiToken(): string | undefined {
  const token = process.env.HARDCOVER_API_TOKEN || env("HARDCOVER_API_TOKEN");
  return token?.trim() || undefined;
}

export const fetchWithConfig = async (url: string) => {
  const headers = new Headers({
    "User-Agent": API_CONFIG.userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  });

  const sessionCookie = getSessionCookie();
  if (sessionCookie) {
    console.log("Adding session cookie to request");
    headers.set("Cookie", sessionCookie);
  } else {
    console.log("No session cookie found");
  }

  const a = await fetch(url, {
    method: "GET",
    headers
  });

  return a;
};
