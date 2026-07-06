import { Hono } from 'hono';
import { requireAuth, type Variables } from '../middleware/auth.js';
import { streamSSE } from 'hono/streaming';
import type { Env } from '../lib/env.js';
import { getRedis } from '../lib/redis.js';
import { progressChannel } from '../lib/queue.js';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '../lib/db.js';
import type { Auth } from '../lib/auth.js';

export function progressRoutes(env: Env, auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();
  router.use('*', requireAuth(auth));

  router.get('/:id/stream', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const db = getDb(env);
    const [upload] = await db
      .select({ id: schema.uploads.id, status: schema.uploads.status })
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, user.id)));
    if (!upload) return c.json({ error: 'Not found' }, 404);

    const redis = getRedis(env);
    const subscriber = redis.duplicate();
    const channel = progressChannel(id);

    return streamSSE(c, async (stream) => {
      await subscriber.subscribe(channel);
      let lastStatus = upload.status;

      const sendCurrent = async () => {
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({ uploadId: id, status: lastStatus }),
        });
      };

      await sendCurrent();

      subscriber.on('message', (_ch, message) => {
        try {
          const event = JSON.parse(message);
          lastStatus = event.status ?? lastStatus;
          stream
            .writeSSE({
              event: 'progress',
              data: JSON.stringify(event),
            })
            .catch(() => {});
          if (event.status === 'done' || event.status === 'failed') {
            stream.close().catch(() => {});
          }
        } catch {
          // ignore malformed
        }
      });

      const heartbeat = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '1' }).catch(() => {});
      }, 15000);

      stream.onAbort(() => {
        clearInterval(heartbeat);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      });

      while (!stream.aborted) {
        await stream.sleep(1000);
      }
      clearInterval(heartbeat);
      await subscriber.unsubscribe(channel).catch(() => {});
      await subscriber.quit().catch(() => {});
    });
  });

  return router;
}