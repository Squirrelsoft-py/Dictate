import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { stat, unlink, readdir, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { nanoid } from 'nanoid';
import {
  CreateUploadSchema,
  type CreateUploadInput,
} from '@dictate/shared/schemas';
import { requireAuth, type Variables } from '../middleware/auth.js';
import type { Env } from '../lib/env.js';
import { getDb, schema } from '../lib/db.js';
import { eq, and, desc } from 'drizzle-orm';
import { createUploadQueue } from '../lib/queue.js';
import type { Redis } from 'ioredis';
import type { Auth } from '../lib/auth.js';

export function uploadRoutes(env: Env, redis: Redis, auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();
  router.use('*', requireAuth(auth));

  const dataDir = env.DATA_DIR;
  const uploadsDir = join(dataDir, 'uploads');

  function ensureUploadsDir() {
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }
  }

  router.post('/', zValidator('json', CreateUploadSchema), async (c) => {
    const user = c.get('user');
    const input = (c.req.valid('json') as CreateUploadInput);

    if (input.sizeBytes > env.UPLOAD_MAX_BYTES) {
      return c.json(
        {
          error: 'File too large',
          maxBytes: env.UPLOAD_MAX_BYTES,
        },
        413,
      );
    }

    ensureUploadsDir();
    const id = nanoid(16);
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = join(uploadsDir, `${id}${extname(safeName) || ''}`);

    const db = getDb(env);
    await db.insert(schema.uploads).values({
      id,
      userId: user.id,
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      mime: input.mime,
      storagePath,
      status: 'uploading',
      asrProvider: input.asrProvider ?? env.ADMIN_ASR_PROVIDER,
      asrModel: input.asrModel ?? null,
      diarizationProvider: input.diarizationProvider ?? env.ADMIN_DIARIZATION_PROVIDER,
      llmProvider: input.llmProvider ?? env.ADMIN_LLM_PROVIDER,
      llmModel: input.llmModel ?? null,
    });

    return c.json({ id, uploadUrl: `/api/uploads/${id}/file` });
  });

  router.put('/:id/file', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const db = getDb(env);
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, user.id)));
    if (!upload) return c.json({ error: 'Not found' }, 404);

    const contentLength = Number(c.req.header('content-length') ?? '0');
    if (contentLength > env.UPLOAD_MAX_BYTES) {
      return c.json({ error: 'File too large' }, 413);
    }

    const body = c.req.raw.body;
    if (!body) return c.json({ error: 'Missing body' }, 400);

    ensureUploadsDir();
    const ws = createWriteStream(upload.storagePath);
    const reader = body.getReader();
    let written = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        written += value.byteLength;
        if (written > env.UPLOAD_MAX_BYTES) {
          ws.destroy();
          await unlink(upload.storagePath).catch(() => {});
          return c.json({ error: 'File too large' }, 413);
        }
        if (!ws.write(value)) {
          await new Promise<void>((resolve) => ws.once('drain', resolve));
        }
      }
      await new Promise<void>((resolve, reject) => {
        ws.end(() => resolve());
        ws.on('error', reject);
      });
    } catch (err) {
      ws.destroy();
      await unlink(upload.storagePath).catch(() => {});
      throw err;
    }

    await db
      .update(schema.uploads)
      .set({ status: 'queued' })
      .where(eq(schema.uploads.id, id));

    const queue = createUploadQueue(redis);
    await queue.add(
      'process-upload',
      {
        uploadId: id,
        userId: user.id,
        filePath: upload.storagePath,
        asrProvider: upload.asrProvider,
        asrModel: upload.asrModel ?? undefined,
        diarizationProvider: upload.diarizationProvider,
        llmProvider: upload.llmProvider,
        llmModel: upload.llmModel ?? undefined,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400 },
      },
    );

    return c.json({ id, status: 'queued' });
  });

  router.get('/', async (c) => {
    const user = c.get('user');
    const db = getDb(env);
    const tagFilter = c.req.query('tag');
    const rows = await db
      .select({
        id: schema.uploads.id,
        filename: schema.uploads.filename,
        sizeBytes: schema.uploads.sizeBytes,
        durationSec: schema.uploads.durationSec,
        status: schema.uploads.status,
        starred: schema.uploads.starred,
        createdAt: schema.uploads.createdAt,
        completedAt: schema.uploads.completedAt,
        asrProvider: schema.uploads.asrProvider,
        diarizationProvider: schema.uploads.diarizationProvider,
        llmProvider: schema.uploads.llmProvider,
        error: schema.uploads.error,
      })
      .from(schema.uploads)
      .where(eq(schema.uploads.userId, user.id))
      .orderBy(desc(schema.uploads.createdAt));

    if (!tagFilter) {
      return c.json({ uploads: rows });
    }

    const tagged = await db
      .select({ uploadId: schema.uploadTags.uploadId })
      .from(schema.uploadTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.uploadTags.tagId))
      .where(and(eq(schema.tags.userId, user.id), eq(schema.tags.name, tagFilter)));
    const taggedIds = new Set(tagged.map((t) => t.uploadId));
    return c.json({ uploads: rows.filter((r) => taggedIds.has(r.id)) });
  });

  router.get('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const db = getDb(env);
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, user.id)));
    if (!upload) return c.json({ error: 'Not found' }, 404);

    const [transcript] = await db
      .select()
      .from(schema.transcripts)
      .where(eq(schema.transcripts.uploadId, id));
    const [notes] = await db.select().from(schema.notes).where(eq(schema.notes.uploadId, id));
    const speakerRows = await db
      .select()
      .from(schema.speakerLabels)
      .where(eq(schema.speakerLabels.uploadId, id));
    const tagRows = await db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .from(schema.uploadTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.uploadTags.tagId))
      .where(eq(schema.uploadTags.uploadId, id));

    return c.json({ upload, transcript, notes, speakers: speakerRows, tags: tagRows });
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const db = getDb(env);
    const [upload] = await db
      .select()
      .from(schema.uploads)
      .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, user.id)));
    if (!upload) return c.json({ error: 'Not found' }, 404);

    await db.delete(schema.uploads).where(eq(schema.uploads.id, id));
    await unlink(upload.storagePath).catch(() => {});
    return c.json({ ok: true });
  });

  router.patch('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const db = getDb(env);
    const updates: Record<string, unknown> = {};
    if (typeof body.filename === 'string') updates.filename = body.filename;
    if (typeof body.starred === 'boolean') updates.starred = body.starred;
    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No valid fields' }, 400);
    }
    const result = await db
      .update(schema.uploads)
      .set(updates)
      .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, user.id)));
    return c.json({ ok: true, changes: result.changes });
  });

  return router;
}

export async function cleanupOldUploads(env: Env) {
  if (env.UPLOAD_RETENTION_DAYS <= 0) return;
  const cutoff = Date.now() - env.UPLOAD_RETENTION_DAYS * 86400_000;
  const db = getDb(env);
  const all = await db.select().from(schema.uploads);
  for (const u of all) {
    if (u.createdAt && u.createdAt.getTime() < cutoff) {
      await unlink(u.storagePath).catch(() => {});
      await db.delete(schema.uploads).where(eq(schema.uploads.id, u.id));
    }
  }
}