import { LRUCache } from 'lru-cache';
import { NextRequest } from 'next/server';
import { ApiEndPointID } from './api-endpoints';
import { env } from 'next-runtime-env';

/**
 * Lightweight abuse control for public book endpoints.
 *
 * Goals:
 * - Allow normal usage of at least ~1 request per second per IP
 * - Soft-throttle only clear abuse (high burst, suspicious UA spam)
 * - Do not apply low daily caps that block legitimate clients
 *
 * Environment:
 * - ABUSE_MAX_REQUESTS_PER_SECOND (default: 15)
 * - ABUSE_MAX_REQUESTS_PER_10S (default: 60)
 * - ABUSE_STRICT_EMPTY_UA (default: true) — empty UA uses half the burst budget
 */

type Options = {
  uniqueTokenPerInterval?: number
  interval?: number
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'default_ip';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isSuspiciousUserAgent(req: NextRequest): boolean {
  const ua = (req.headers.get("user-agent") || "").trim();
  if (!ua) return true;
  // Extremely short / empty-looking agents
  if (ua.length < 3) return true;
  return false;
}

type WindowState = {
  secondBucket: number;
  secondCount: number;
  tenSecondBucket: number;
  tenSecondCount: number;
};

export function rateLimit(_options?: Options) {
  const maxPerSecond = parsePositiveInt(
    process.env.ABUSE_MAX_REQUESTS_PER_SECOND || env("ABUSE_MAX_REQUESTS_PER_SECOND"),
    15
  );
  const maxPer10s = parsePositiveInt(
    process.env.ABUSE_MAX_REQUESTS_PER_10S || env("ABUSE_MAX_REQUESTS_PER_10S"),
    60
  );
  const strictEmptyUa =
    (process.env.ABUSE_STRICT_EMPTY_UA || env("ABUSE_STRICT_EMPTY_UA") || "true")
      .toLowerCase() !== "false";

  const windows = new LRUCache<string, WindowState>({
    max: 50_000,
    ttl: 60_000,
  });

  function checkAbuse(req: NextRequest, endpoint: ApiEndPointID): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const secondBucket = Math.floor(now / 1000);
      const tenSecondBucket = Math.floor(now / 10_000);
      const clientIp = getClientIp(req);
      const token = `${endpoint}_${clientIp}`;

      let state = windows.get(token);
      if (!state) {
        state = {
          secondBucket,
          secondCount: 0,
          tenSecondBucket,
          tenSecondCount: 0,
        };
      }

      if (state.secondBucket !== secondBucket) {
        state.secondBucket = secondBucket;
        state.secondCount = 0;
      }
      if (state.tenSecondBucket !== tenSecondBucket) {
        state.tenSecondBucket = tenSecondBucket;
        state.tenSecondCount = 0;
      }

      state.secondCount += 1;
      state.tenSecondCount += 1;
      windows.set(token, state);

      const suspicious = strictEmptyUa && isSuspiciousUserAgent(req);
      const secondLimit = suspicious ? Math.max(3, Math.floor(maxPerSecond / 2)) : maxPerSecond;
      const tenSecondLimit = suspicious ? Math.max(10, Math.floor(maxPer10s / 2)) : maxPer10s;

      if (state.secondCount > secondLimit || state.tenSecondCount > tenSecondLimit) {
        reject();
        return;
      }

      resolve();
    });
  }

  return {
    /** Soft abuse check for public book endpoints */
    check: (req: NextRequest, endpoint: ApiEndPointID) => checkAbuse(req, endpoint),
    /** Alias kept for call sites that previously used import limits */
    checkImport: (req: NextRequest, endpoint: ApiEndPointID) => checkAbuse(req, endpoint),
  };
}
