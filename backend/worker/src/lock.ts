import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

export type Release = () => Promise<void>;
export interface Locker {
  /** Wait up to waitMs for the lock; returns a release function, or null on timeout. */
  acquire(key: string, opts?: { ttlMs?: number; waitMs?: number }): Promise<Release | null>;
}

const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** One agent turn per conversation at a time. */
export function redisLocker(redis: Redis): Locker {
  return {
    async acquire(key, { ttlMs = 60_000, waitMs = 30_000 } = {}) {
      const token = randomUUID();
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        if ((await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX')) === 'OK') {
          return async () => void (await redis.eval(RELEASE_LUA, 1, `lock:${key}`, token));
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    }
  };
}

/** Fixed-window per-customer rate limit to stop abuse and cost blowups. */
export function redisRateLimiter(redis: Redis, limit = 20, windowSec = 60) {
  return async (key: string): Promise<boolean> => {
    const k = `rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    return n <= limit;
  };
}
