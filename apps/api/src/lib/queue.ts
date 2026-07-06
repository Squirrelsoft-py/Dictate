import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { JOB_PROGRESS_CHANNEL_PREFIX, JOB_PROGRESS_CHANNEL_SUFFIX } from '@dictate/shared';

export const UPLOAD_QUEUE_NAME = 'uploads';

export function createUploadQueue(redis: Redis) {
  return new Queue('uploads', { connection: redis });
}

export function progressChannel(uploadId: string) {
  return `${JOB_PROGRESS_CHANNEL_PREFIX}${uploadId}${JOB_PROGRESS_CHANNEL_SUFFIX}`;
}