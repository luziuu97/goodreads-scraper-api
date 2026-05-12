import { LRUCache } from 'lru-cache';
import { NextRequest } from 'next/server';
import { ApiEndPointID } from './api-endpoints';
import { env } from 'next-runtime-env';

/**
 * Environment Variables for Rate Limiting Configuration:
 * 
 * RATE_LIMIT_UNIQUE_TOKENS (default: 100)
 * - Maximum number of unique IP + endpoint combinations to track
 * - Each combination of IP address and endpoint counts as one token
 * - Once reached, oldest tokens are removed to make space for new ones
 * 
 * RATE_LIMIT_INTERVAL (default: 86400000 - 24 hours in milliseconds)
 * - Time window for rate limiting in milliseconds
 * - Counters reset after this interval
 * - Default is 24 hours (86400000ms)
 * 
 * RATE_LIMIT_MAX_REQUESTS (default: 100)
 * - Maximum number of requests allowed per IP per endpoint per interval
 * - Separate counter for each endpoint
 * - Resets every RATE_LIMIT_INTERVAL milliseconds
 *
 * IMPORT_RATE_LIMIT_INTERVAL (default: 3600000 - 1 hour in milliseconds)
 * IMPORT_RATE_LIMIT_MAX_REQUESTS (default: 5000)
 * IMPORT_RATE_LIMIT_UNIQUE_TOKENS (default: 50000)
 * - Dedicated profile for import-heavy user endpoints
 * 
 * Example:
 * If IP 1.2.3.4 makes requests to a public endpoint:
 * - Counter starts at 0
 * - Increments with each request
 * - Blocks when reaches RATE_LIMIT_MAX_REQUESTS
 * - Resets after RATE_LIMIT_INTERVAL milliseconds
 */

type Options = {
  uniqueTokenPerInterval?: number
  interval?: number
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  
  if (forwarded) {
    // Get the first IP if multiple are present
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  // Fallback to a default token if no IP can be determined
  return 'default_ip';
}

export function rateLimit(options?: Options) {
  const maxRequests =
    parseInt(env("RATE_LIMIT_MAX_REQUESTS") || "") ||
    parseInt(env("RATE_LIMIT_DAILY") || "") ||
    100;
  const importMaxRequests =
    parseInt(env("IMPORT_RATE_LIMIT_MAX_REQUESTS") || "") ||
    parseInt(env("IMPORT_RATE_LIMIT_DAILY") || "") ||
    5000;
  const maxTokens =
    parseInt(env("RATE_LIMIT_UNIQUE_TOKENS") || "") ||
    options?.uniqueTokenPerInterval ||
    100;
  const importMaxTokens =
    parseInt(env("IMPORT_RATE_LIMIT_UNIQUE_TOKENS") || "") ||
    50000;
  const intervalMs =
    parseInt(env("RATE_LIMIT_INTERVAL") || "") ||
    options?.interval ||
    24 * 60 * 60 * 1000;
  const importIntervalMs =
    parseInt(env("IMPORT_RATE_LIMIT_INTERVAL") || "") ||
    60 * 60 * 1000;

  const tokenCache = new LRUCache<string, number[]>({
    max: maxTokens,
    ttl: intervalMs,
  });
  const importTokenCache = new LRUCache<string, number[]>({
    max: importMaxTokens,
    ttl: importIntervalMs,
  });

  function checkLimit(
    req: NextRequest,
    endpoint: ApiEndPointID,
    cache: LRUCache<string, number[]>,
    requestLimit: number
  ) {
    return new Promise<void>((resolve, reject) => {
      const clientIp = getClientIp(req);
      const token = `${endpoint}_${clientIp}`;
      const tokenCount = (cache.get(token) as number[]) || [0];

      if (tokenCount[0] === 0) {
        cache.set(token, [1]);
        resolve();
      } else {
        const currentUsage = tokenCount[0];
        const isRateLimited = currentUsage >= requestLimit;
        if (isRateLimited) {
          reject();
        } else {
          cache.set(token, [currentUsage + 1]);
          resolve();
        }
      }
    });
  }

  return {
    check: (req: NextRequest, endpoint: ApiEndPointID) =>
      checkLimit(req, endpoint, tokenCache, maxRequests),
    checkImport: (req: NextRequest, endpoint: ApiEndPointID) =>
      checkLimit(req, endpoint, importTokenCache, importMaxRequests),
  };
}
