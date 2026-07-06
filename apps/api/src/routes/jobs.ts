import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { requireAuth, type Variables } from '../middleware/auth.js';
import type { Env } from '../lib/env.js';
import { getDb, schema } from '../lib/db.js';
import type { Auth } from '../lib/auth.js';

export function jobRoutes(env: Env, auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();
  router.use('*', requireAuth(auth));

  router.get('/:id/status', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const db = getDb(env);
    const [upload] = await db
      .select({
        id: schema.uploads.id,
        status: schema.uploads.status,
        progressJson: schema.uploads.progressJson,
        error: schema.uploads.error,
        completedAt: schema.uploads.completedAt,
      })
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, user.id)));
    if (!upload) return c.json({ error: 'Not found' }, 404);
    return c.json(upload);
  });

  return router;
}