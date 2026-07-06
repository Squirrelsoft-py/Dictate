import { Redis } from 'ioredis';
import type { Env } from './env.js';

let cached: Redis | null = null;

export function getRedis(env: Env): Redis {
  if (cached) return cached;
  cached = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  cached.on('error', (err) => {
    console.error('[redis] error:', err.message);
  });
  return cached;
}

export async function closeRedis() {
  if (cached) {
    await cached.quit();
    cached = null;
  }
}