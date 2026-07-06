import { Redis } from 'ioredis';
import type { Env } from './env.js';

let cached: Redis | null = null;

export function getRedis(env: Env): Redis {
  if (cached) return cached;
  cached = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    reconnectOnError: () => true,
  });
  cached.on('error', (err) => {
    if (!cached) return;
    console.error('[redis] error:', err.message);
  });
  return cached;
}

export async function closeRedis() {
  if (cached) {
    try {
      await cached.quit();
    } catch {
      cached.disconnect();
    }
    cached = null;
  }
}

process.on('uncaughtException', (err: any) => {
  if (err?.name === 'ReplyError' || err?.name === 'AbortError') {
    console.error('[redis] unhandled:', err.message);
    return;
  }
  const code = err?.code;
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE'
  ) {
    console.error('[redis] connection error:', code, err?.message);
    return;
  }
  throw err;
});