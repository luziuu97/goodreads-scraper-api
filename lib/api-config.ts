import { env } from "next-runtime-env";
import { rateLimit } from "./rate-limit";

export const API_CONFIG = {
  userAgent:
    env("NEXT_PUBLIC_USER_AGENT") ||
    "Mozilla/5.0 (compatible; BookMetadataAPI/1.0; +https://github.com/ekamid/goodreads-scraper-api)",
  /** Soft abuse protection for public book endpoints (not a low daily quota). */
  publicRateLimit: rateLimit(),
};

export function getHardcoverApiToken(): string | undefined {
  const token = process.env.HARDCOVER_API_TOKEN || env("HARDCOVER_API_TOKEN");
  return token?.trim() || undefined;
}
