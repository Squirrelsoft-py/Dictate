import { Redis } from 'ioredis';
import { JOB_PROGRESS_CHANNEL_PREFIX, JOB_PROGRESS_CHANNEL_SUFFIX } from '@dictate/shared';
import type { Env } from './env.js';
import { getDb, schema, eq } from './db.js';

let cached: Redis | null = null;

export function getRedis(env: Env): Redis {
  if (cached) return cached;
  cached = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    reconnectOnError: () => true,
  });
  cached.on('error', (err) => {
    if (!cached) return;
    console.error('[worker/redis] error:', err.message);
  });
  return cached;
}

export function progressChannel(uploadId: string) {
  return `${JOB_PROGRESS_CHANNEL_PREFIX}${uploadId}${JOB_PROGRESS_CHANNEL_SUFFIX}`;
}

export interface ProgressUpdate {
  uploadId: string;
  status: string;
  stage?: string;
  message?: string;
  progress?: number;
  error?: string;
}

export async function publishProgress(redis: Redis, update: ProgressUpdate) {
  const payload = JSON.stringify({ ...update, timestamp: Date.now() });
  await redis.publish(progressChannel(update.uploadId), payload);
  const env = await import('./env.js').then((m) => m.loadEnv);
  const d = getDb(env());
  await d
    .update(schema.uploads)
    .set({
      status: update.status,
      progressJson: payload,
    })
    .where(eq(schema.uploads.id, update.uploadId));
}