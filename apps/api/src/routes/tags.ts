import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { CreateTagSchema } from '@dictate/shared/schemas';
import { requireAuth, type Variables } from '../middleware/auth.js';
import type { Env } from '../lib/env.js';
import { getDb, schema } from '../lib/db.js';
import { nanoid } from 'nanoid';
import type { Auth } from '../lib/auth.js';

export function tagRoutes(env: Env, auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();
  router.use('*', requireAuth(auth));

  router.get('/', async (c) => {
    const user = c.get('user');
    const db = getDb(env);
    const rows = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.userId, user.id));
    return c.json({ tags: rows });
  });

  router.post('/', zValidator('json', CreateTagSchema), async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const db = getDb(env);
    const id = nanoid(12);
    await db.insert(schema.tags).values({
      id,
      userId: user.id,
      name: input.name,
      color: input.color ?? '#FF6B35',
    });
    const [tag] = await db.select().from(schema.tags).where(eq(schema.tags.id, id));
    return c.json({ tag });
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const db = getDb(env);
    await db
      .delete(schema.tags)
      .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, user.id)));
    return c.json({ ok: true });
  });

  router.post('/:uploadId/:tagId', async (c) => {
    const user = c.get('user');
    const uploadId = c.req.param('uploadId');
    const tagId = c.req.param('tagId');
    const db = getDb(env);
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, uploadId), eq(schema.uploads.userId, user.id)));
    const [tag] = await db
      .select()
      .from(schema.tags)
      .where(and(eq(schema.tags.id, tagId), eq(schema.tags.userId, user.id)));
    if (!upload || !tag) return c.json({ error: 'Not found' }, 404);
    await db.insert(schema.uploadTags).values({ uploadId, tagId }).onConflictDoNothing();
    return c.json({ ok: true });
  });

  router.delete('/:uploadId/:tagId', async (c) => {
    const user = c.get('user');
    const uploadId = c.req.param('uploadId');
    const tagId = c.req.param('tagId');
    const db = getDb(env);
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, uploadId), eq(schema.uploads.userId, user.id)));
    if (!upload) return c.json({ error: 'Not found' }, 404);
    await db
      .delete(schema.uploadTags)
      .where(and(eq(schema.uploadTags.uploadId, uploadId), eq(schema.uploadTags.tagId, tagId)));
    return c.json({ ok: true });
  });

  return router;
}