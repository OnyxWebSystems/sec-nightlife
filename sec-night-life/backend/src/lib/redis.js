/**
 * Optional Upstash Redis (REST). No-op when env vars are missing.
 */
import { Redis } from '@upstash/redis';
import { logger } from './logger.js';

let redis = null;

export function getRedis() {
  if (redis) return redis;
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  try {
    redis = new Redis({ url, token });
    return redis;
  } catch (e) {
    logger.warn('Upstash Redis init failed', { err: e?.message });
    return null;
  }
}

export function redisConfigured() {
  return Boolean(getRedis());
}

export async function cacheGetJson(key) {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch (e) {
    logger.warn('redis cacheGetJson failed', { key, err: e?.message });
    return null;
  }
}

export async function cacheSetJson(key, value, ttlSeconds = 30) {
  const client = getRedis();
  if (!client) return false;
  try {
    await client.set(key, JSON.stringify(value), { ex: Math.max(1, ttlSeconds) });
    return true;
  } catch (e) {
    logger.warn('redis cacheSetJson failed', { key, err: e?.message });
    return false;
  }
}

/**
 * Express-rate-limit compatible store backed by Upstash Redis.
 * Falls back to in-memory Map when Redis is not configured.
 */
export function createRedisRateLimitStore({ prefix = 'rl' } = {}) {
  const memory = new Map();

  return {
    async increment(key) {
      const client = getRedis();
      const fullKey = `${prefix}:${key}`;
      if (!client) {
        const now = Date.now();
        const entry = memory.get(fullKey) || { totalHits: 0, resetTime: new Date(now + 15 * 60 * 1000) };
        entry.totalHits += 1;
        memory.set(fullKey, entry);
        return {
          totalHits: entry.totalHits,
          resetTime: entry.resetTime,
        };
      }
      try {
        const hits = await client.incr(fullKey);
        if (hits === 1) {
          await client.expire(fullKey, 15 * 60);
        }
        const ttl = await client.ttl(fullKey);
        const resetTime = new Date(Date.now() + Math.max(ttl, 1) * 1000);
        return { totalHits: hits, resetTime };
      } catch (e) {
        logger.warn('redis rate limit increment failed', { err: e?.message });
        const now = Date.now();
        return { totalHits: 1, resetTime: new Date(now + 15 * 60 * 1000) };
      }
    },
    async decrement(key) {
      const client = getRedis();
      const fullKey = `${prefix}:${key}`;
      if (!client) {
        const entry = memory.get(fullKey);
        if (entry && entry.totalHits > 0) entry.totalHits -= 1;
        return;
      }
      try {
        await client.decr(fullKey);
      } catch {
        /* ignore */
      }
    },
    async resetKey(key) {
      const client = getRedis();
      const fullKey = `${prefix}:${key}`;
      if (!client) {
        memory.delete(fullKey);
        return;
      }
      try {
        await client.del(fullKey);
      } catch {
        /* ignore */
      }
    },
  };
}
