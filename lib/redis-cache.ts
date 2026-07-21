import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { NextRequest } from 'next/server';
import { env } from 'next-runtime-env';

/** Search results TTL: 1 day */
export const CACHE_TTL_SEARCH = 24 * 60 * 60;

/** Book details / enrichment TTL: 14 days */
export const CACHE_TTL_DETAILS = 14 * 24 * 60 * 60;

/** Cover-related data TTL: 30 days */
export const CACHE_TTL_COVER = 30 * 24 * 60 * 60;

/** @deprecated Use CACHE_TTL_DETAILS — kept for callers that still pass default */
export const CACHE_TTL = CACHE_TTL_DETAILS;

let redis: Redis | null = null;
const memoryCache = new LRUCache<string, string>({
  max: 1000,
  ttl: CACHE_TTL_DETAILS * 1000,
});

function isRedisDisabled(): boolean {
  const value = process.env.DISABLE_REDIS || env('DISABLE_REDIS');
  return value?.toLowerCase() === 'true';
}

function getRedisClient(): Redis | null {
  if (isRedisDisabled()) {
    return null;
  }

  const redisUrl = process.env.REDIS_URL || env('REDIS_URL');
  
  if (!redisUrl) {
    return null;
  }

  if (!redis) {
    try {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: false,
        enableOfflineQueue: false,
      });
      
      redis.on('error', (err) => {
        console.error('Redis connection error:', err);
      });
      
      redis.on('connect', () => {
        console.log('Redis connected successfully');
      });
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      redis = null;
      return null;
    }
  }

  return redis;
}

/**
 * Normalize cache key fragments so equivalent queries share one entry.
 */
export function normalizeCachePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Generate a logical cache key from sorted, normalized params.
 * Prefer this over raw URL strings to avoid cache fragmentation.
 */
export function buildLogicalCacheKey(
  endpoint: string,
  parts: Record<string, string | number | null | undefined>
): string {
  const sorted = Object.keys(parts)
    .sort()
    .filter((key) => {
      const v = parts[key];
      return v !== null && v !== undefined && String(v).trim() !== '';
    })
    .map((key) => `${key}=${normalizeCachePart(String(parts[key]))}`)
    .join('&');

  return `api:${endpoint}:v1:${sorted}`;
}

/**
 * Generate cache key from request (legacy-compatible helper).
 * Prefer buildLogicalCacheKey for book routes.
 */
export function generateCacheKey(
  req: NextRequest,
  endpoint: string,
  params?: Record<string, string>
): string {
  const url = new URL(req.url);
  const searchParams = Array.from(url.searchParams.entries())
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => [key.toLowerCase(), normalizeCachePart(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  const queryKey = searchParams.map(([k, v]) => `${k}=${v}`).join('&');
  const paramsKey = params
    ? Object.keys(params)
        .sort()
        .map((k) => `${k}=${normalizeCachePart(params[k])}`)
        .join('&')
    : '';

  return `api:${endpoint}:v1:${normalizeCachePart(url.pathname)}:${queryKey}:${paramsKey}`;
}

export async function getCachedResponse(cacheKey: string): Promise<any | null> {
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached) {
    return JSON.parse(memoryCached);
  }

  const client = getRedisClient();
  
  if (!client) {
    return null;
  }

  if (client.status !== 'ready' && client.status !== 'connect') {
    return null;
  }

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      memoryCache.set(cacheKey, cached);
      return JSON.parse(cached);
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis get error:', error);
    }
  }

  return null;
}

export async function setCachedResponse(
  cacheKey: string,
  data: any,
  ttl: number = CACHE_TTL_DETAILS
): Promise<void> {
  memoryCache.set(cacheKey, JSON.stringify(data), {
    ttl: ttl * 1000,
  });

  const client = getRedisClient();
  
  if (!client) {
    return;
  }

  if (client.status !== 'ready' && client.status !== 'connect') {
    return;
  }

  try {
    await client.setex(cacheKey, ttl, JSON.stringify(data));
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis set error:', error);
    }
  }
}

export async function deleteCachedResponse(cacheKey: string): Promise<void> {
  memoryCache.delete(cacheKey);

  const client = getRedisClient();
  
  if (!client) {
    return;
  }

  if (client.status !== 'ready' && client.status !== 'connect') {
    return;
  }

  try {
    await client.del(cacheKey);
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis delete error:', error);
    }
  }
}

export async function clearEndpointCache(endpoint: string): Promise<void> {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`api:${endpoint}:`)) {
      memoryCache.delete(key);
    }
  }

  const client = getRedisClient();
  
  if (!client) {
    return;
  }

  if (client.status !== 'ready' && client.status !== 'connect') {
    return;
  }

  try {
    const keys = await client.keys(`api:${endpoint}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis clear error:', error);
    }
  }
}
