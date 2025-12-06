import { env } from "next-runtime-env";
import { rateLimit } from "./rate-limit";

export const API_CONFIG = {
  userAgent: env("NEXT_PUBLIC_USER_AGENT") || 
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
  sessionCookie: process.env.GOODREADS_SESSION_COOKIE || env("GOODREADS_SESSION_COOKIE"),
  baseURL: "https://www.goodreads.com",
  rateLimit: rateLimit({
    interval: 24 * 60 * 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 500 // Max 500 users per minute
  })
};

export const fetchWithConfig = async (url: string) => {
  const headers = new Headers({
    "User-Agent": API_CONFIG.userAgent
  });

  if (API_CONFIG.sessionCookie) {
    console.log("Adding session cookie to request");
    headers.set("Cookie", API_CONFIG.sessionCookie);
  } else {
    console.log("No session cookie found");
  }

  const a = await fetch(url, {
    method: "GET",
    headers
  });

  return a;
};