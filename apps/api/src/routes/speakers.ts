import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import { RenameSpeakerSchema } from '@dictate/shared/schemas';
import { requireAuth, type Variables } from '../middleware/auth.js';
import type { Env } from '../lib/env.js';
import { getDb, schema } from '../lib/db.js';
import type { Auth } from '../lib/auth.js';

export function speakerRoutes(env: Env, auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();
  router.use('*', requireAuth(auth));

  router.put(
    '/:uploadId/:speakerId',
    zValidator('json', RenameSpeakerSchema.omit({ speakerId: true })),
    async (c) => {
      const user = c.get('user');
      const uploadId = c.req.param('uploadId');
      const speakerId = c.req.param('speakerId');
      const { customName } = c.req.valid('json');
      const db = getDb(env);
      const [upload] = await db
        .select()
        .from(schema.uploads)
        .where(and(eq(schema.uploads.id, uploadId), eq(schema.uploads.userId, user.id)));
      if (!upload) return c.json({ error: 'Not found' }, 404);
      await db
        .update(schema.speakerLabels)
        .set({ customName, confirmed: true })
        .where(
          and(
            eq(schema.speakerLabels.uploadId, uploadId),
            eq(schema.speakerLabels.id, speakerId),
          ),
        );
      return c.json({ ok: true });
    },
  );

  return router;
}