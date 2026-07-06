import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { requireAuth, type Variables } from '../middleware/auth.js';
import type { Env } from '../lib/env.js';
import { getDb, schema } from '../lib/db.js';
import { formatTranscriptMarkdown } from '../lib/markdown.js';
import type { Auth } from '../lib/auth.js';

export function exportRoutes(env: Env, auth: Auth) {
  const router = new Hono<{ Variables: Variables }>();
  router.use('*', requireAuth(auth));

  router.get('/:id/markdown', async (c) => {
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

    const segments = transcript ? JSON.parse(transcript.segmentsJson) : [];
    const speakers = new Map(
      speakerRows.map((s) => [s.originalLabel, s.customName ?? s.suggestedName ?? s.originalLabel]),
    );

    const md = formatTranscriptMarkdown({
      filename: upload.filename,
      createdAt: upload.createdAt,
      notes: notes
        ? {
            summary: notes.summary,
            keyPoints: JSON.parse(notes.keyPointsJson),
            actionItems: JSON.parse(notes.actionItemsJson),
            decisions: JSON.parse(notes.decisionsJson),
            chapters: JSON.parse(notes.chaptersJson),
            highlights: JSON.parse(notes.highlightsJson),
          }
        : null,
      segments,
      speakerLabels: speakers,
    });

    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header(
      'Content-Disposition',
      `attachment; filename="${upload.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.md"`,
    );
    return c.body(md);
  });

  return router;
}