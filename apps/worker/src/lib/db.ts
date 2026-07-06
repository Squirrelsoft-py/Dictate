import { createDb, schema } from '@dictate/shared/db';
import { eq } from 'drizzle-orm';
import type { Env } from './env.js';

let cachedDb: ReturnType<typeof createDb> | null = null;

export function getDb(env: Env) {
  if (cachedDb) return cachedDb;
  const path = `${env.DATA_DIR}/dictate.db`;
  cachedDb = createDb(path);
  return cachedDb;
}

export { schema, eq };