import Redis from 'ioredis';
import { NextRequest } from 'next/server';
import { env } from 'next-runtime-env';

// Cache TTL: 4 hours in seconds
export const CACHE_TTL = 4 * 60 * 60; // 14400 seconds

// Initialize Redis client
let redis: Redis | null = null;

function getRedisClient(): Redis | null {
  // If Redis is not configured, return null (cache will be disabled)
  const redisUrl = process.env.REDIS_URL || env('REDIS_URL');
  
  if (!redisUrl) {
    return null;
  }

  // Create singleton instance
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
        // Don't throw, just log - allow app to continue without cache
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
 * Generate cache key from request
 */
export function generateCacheKey(req: NextRequest, endpoint: string, params?: Record<string, string>): string {
  const url = new URL(req.url);
  const path = url.pathname;
  const searchParams = url.searchParams.toString();
  
  // Include params in cache key if provided
  const paramsKey = params ? JSON.stringify(params) : '';
  
  return `api:${endpoint}:${path}:${searchParams}:${paramsKey}`;
}

/**
 * Get cached response
 */
export async function getCachedResponse(cacheKey: string): Promise<any | null> {
  const client = getRedisClient();
  
  if (!client) {
    return null;
  }

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Redis get error:', error);
  }

  return null;
}

/**
 * Set cached response
 */
export async function setCachedResponse(cacheKey: string, data: any, ttl: number = CACHE_TTL): Promise<void> {
  const client = getRedisClient();
  
  if (!client) {
    return;
  }

  try {
    await client.setex(cacheKey, ttl, JSON.stringify(data));
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

/**
 * Delete cached response
 */
export async function deleteCachedResponse(cacheKey: string): Promise<void> {
  const client = getRedisClient();
  
  if (!client) {
    return;
  }

  try {
    await client.del(cacheKey);
  } catch (error) {
    console.error('Redis delete error:', error);
  }
}

/**
 * Clear all cache for an endpoint
 */
export async function clearEndpointCache(endpoint: string): Promise<void> {
  const client = getRedisClient();
  
  if (!client) {
    return;
  }

  try {
    const keys = await client.keys(`api:${endpoint}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error('Redis clear error:', error);
  }
}

