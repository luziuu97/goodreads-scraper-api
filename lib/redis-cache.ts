import { gunzipSync, gzipSync } from "node:zlib";
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { NextRequest } from 'next/server';
import { env } from 'next-runtime-env';

const GZIP_PREFIX = "gz1:";
const MEMORY_MAX_ENTRY_BYTES = 8 * 1024;
const inflightLoads = new Map<string, Promise<unknown>>();

/** Search results TTL: 1 day */
export const CACHE_TTL_SEARCH = 24 * 60 * 60;

/** Book / series details TTL: 14 days */
export const CACHE_TTL_DETAILS = 14 * 24 * 60 * 60;

/** Cover + format/edition catalog data TTL: 30 days (stable media metadata) */
export const CACHE_TTL_COVER = 30 * 24 * 60 * 60;

/** Alias for book formats / edition lists (same tier as covers). */
export const CACHE_TTL_FORMATS = CACHE_TTL_COVER;

/** @deprecated Use CACHE_TTL_DETAILS — kept for callers that still pass default */
export const CACHE_TTL = CACHE_TTL_DETAILS;

let redis: Redis | null = null;
let redisReadyPromise: Promise<Redis | null> | null = null;
let redisUnavailableUntil = 0;
const memoryCache = new LRUCache<string, string>({
  max: 400,
  maxSize: 2_000_000,
  sizeCalculation: (value) => Math.max(1, value.length),
  ttl: CACHE_TTL_SEARCH * 1000,
});

function encodeCacheValue(data: unknown): string {
  const json = JSON.stringify(data);
  if (json.length < 1024) return json;
  return GZIP_PREFIX + gzipSync(json).toString("base64");
}

function decodeCacheValue(raw: string): any {
  if (!raw.startsWith(GZIP_PREFIX)) return JSON.parse(raw);
  return JSON.parse(gunzipSync(Buffer.from(raw.slice(GZIP_PREFIX.length), "base64")).toString("utf8"));
}

function storeInMemory(cacheKey: string, encoded: string, ttlSeconds: number): void {
  if (encoded.length > MEMORY_MAX_ENTRY_BYTES) return;
  memoryCache.set(cacheKey, encoded, { ttl: ttlSeconds * 1000 });
}

export async function withSingleFlight<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inflightLoads.get(key);
  if (existing) return existing as Promise<T>;
  const pending = loader().finally(() => {
    inflightLoads.delete(key);
  });
  inflightLoads.set(key, pending);
  return pending;
}

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
        maxRetriesPerRequest: 1,
        connectTimeout: 1_000,
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

      redis.on('ready', () => {
        redisUnavailableUntil = 0;
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
 * Return a usable Redis client, waiting briefly for a newly-created connection.
 * Without this, the first requests after a cold start are guaranteed cache misses
 * because ioredis is still in its `connecting` state and offline queuing is off.
 */
async function getReadyRedisClient(): Promise<Redis | null> {
  const client = getRedisClient();
  if (!client) return null;
  if (client.status === 'ready') return client;
  if (Date.now() < redisUnavailableUntil) return null;

  if (!redisReadyPromise) {
    redisReadyPromise = new Promise<Redis | null>((resolve) => {
      let settled = false;
      const finish = (value: Redis | null) => {
        if (settled) return;
        settled = true;
        if (!value) redisUnavailableUntil = Date.now() + 5_000;
        clearTimeout(timeout);
        client.off('ready', onReady);
        client.off('end', onUnavailable);
        resolve(value);
      };
      const onReady = () => finish(client);
      const onUnavailable = () => finish(null);
      const timeout = setTimeout(() => finish(null), 1_000);

      client.once('ready', onReady);
      client.once('end', onUnavailable);
    }).finally(() => {
      redisReadyPromise = null;
    });
  }

  return redisReadyPromise;
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

  // Bump schema version when response shape / authority rules change.
  return `api:${endpoint}:v9:${sorted}`;
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

  return `api:${endpoint}:v2:${normalizeCachePart(url.pathname)}:${queryKey}:${paramsKey}`;
}

export async function getCachedResponse(cacheKey: string): Promise<any | null> {
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached) {
    try {
      return decodeCacheValue(memoryCached);
    } catch {
      memoryCache.delete(cacheKey);
    }
  }

  const client = await getReadyRedisClient();
  
  if (!client) {
    return null;
  }

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      const parsed = decodeCacheValue(cached);
      storeInMemory(cacheKey, cached, CACHE_TTL_SEARCH);
      return parsed;
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis get error:', error);
    }
  }

  return null;
}

/** Read many cache entries with a single Redis round trip. */
export async function getCachedResponses(
  cacheKeys: string[]
): Promise<Map<string, any>> {
  const found = new Map<string, any>();
  const redisKeys: string[] = [];

  for (const key of new Set(cacheKeys)) {
    const memoryCached = memoryCache.get(key);
    if (memoryCached) {
      try {
        found.set(key, decodeCacheValue(memoryCached));
      } catch {
        memoryCache.delete(key);
        redisKeys.push(key);
      }
    } else {
      redisKeys.push(key);
    }
  }

  if (redisKeys.length === 0) return found;
  const client = await getReadyRedisClient();
  if (!client) return found;

  try {
    const values = await client.mget(...redisKeys);
    for (let i = 0; i < redisKeys.length; i++) {
      const value = values[i];
      if (!value) continue;
      try {
        const key = redisKeys[i];
        storeInMemory(key, value, CACHE_TTL_SEARCH);
        found.set(key, decodeCacheValue(value));
      } catch {
        // Ignore malformed cache entries; the caller will treat them as misses.
      }
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis mget error:', error);
    }
  }

  return found;
}

export async function setCachedResponse(
  cacheKey: string,
  data: any,
  ttl: number = CACHE_TTL_DETAILS
): Promise<void> {
  const encoded = encodeCacheValue(data);
  storeInMemory(cacheKey, encoded, ttl);

  const client = await getReadyRedisClient();
  
  if (!client) {
    return;
  }

  try {
    await client.setex(cacheKey, ttl, encoded);
  } catch (error) {
    if (error instanceof Error && !error.message.includes("Stream isn't writeable")) {
      console.error('Redis set error:', error);
    }
  }
}

export async function getOrSetCached<T>(
  cacheKey: string,
  ttl: number,
  loader: () => Promise<T>,
  shouldStore: (value: T) => boolean = () => true
): Promise<{ value: T; cache: "HIT" | "MISS" }> {
  const hit = await getCachedResponse(cacheKey);
  if (hit !== null && hit !== undefined) {
    return { value: hit as T, cache: "HIT" };
  }

  return withSingleFlight(cacheKey, async () => {
    const again = await getCachedResponse(cacheKey);
    if (again !== null && again !== undefined) {
      return { value: again as T, cache: "HIT" };
    }
    const value = await loader();
    if (shouldStore(value)) {
      await setCachedResponse(cacheKey, value, ttl);
    }
    return { value, cache: "MISS" };
  });
}

export async function deleteCachedResponse(cacheKey: string): Promise<void> {
  memoryCache.delete(cacheKey);

  const client = await getReadyRedisClient();
  
  if (!client) {
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

  const client = await getReadyRedisClient();
  
  if (!client) {
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

export async function clearAllCache(): Promise<void> {
  memoryCache.clear();
  const client = await getReadyRedisClient();
  if (client) {
    try {
      await client.flushdb();
    } catch {}
  }
}
