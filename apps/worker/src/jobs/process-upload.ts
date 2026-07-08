import type { Env } from '../lib/env.js';
import { getDb, schema } from '../lib/db.js';
import { getRedis, publishProgress } from '../lib/redis.js';
import { Worker, type Job } from 'bullmq';
import { createASRProviderFromEnv } from '../providers/asr/index.js';
import { createDiarizationProviderFromEnv } from '../providers/diarization/index.js';
import { createLLMProviderFromEnv } from '../providers/llm/index.js';
import { assignSpeakersToSegments, uniqueSpeakers } from '../lib/align.js';
import { SUMMARIZE_PROMPT, SPEAKER_NAMING_PROMPT } from '@dictate/shared';
import {
  NotesSchema,
  SpeakerNameSuggestionSchema,
  type Segment,
  type SpeakerTurn,
  type Notes,
} from '@dictate/shared/schemas';
import { nanoid } from 'nanoid';
import { stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';

interface JobData {
  uploadId: string;
  userId: string;
  filePath: string;
  asrProvider: string;
  asrModel?: string;
  diarizationProvider: string;
  llmProvider: string;
  llmModel?: string;
}

const QUEUE_NAME = 'uploads';

export function startWorker(env: Env) {
  const redis = getRedis(env);

  const worker = new Worker<JobData>(
    QUEUE_NAME,
    async (job: Job<JobData>) => {
      const data = job.data;
      console.log(`[worker] processing upload ${data.uploadId}`);
      const db = getDb(env);

      try {
        const [upload] = await db
          .select()
          .from(schema.uploads)
          .where(eq(schema.uploads.id, data.uploadId));
        if (!upload) throw new Error(`Upload ${data.uploadId} not found`);

        // 1) ASR
        await publishProgress(redis, {
          uploadId: data.uploadId,
          status: 'transcribing',
          message: 'Transcribing audio',
          progress: 0.1,
        });

        const asr = createASRProviderFromEnv(env, { id: data.asrProvider });
        console.log(
          `[worker] transcribing upload ${data.uploadId} via ${data.asrProvider} ` +
            `(file: ${data.filePath})`,
        );
        const asrStartedAt = Date.now();
        const asrResult = await asr.transcribe({
          filePath: data.filePath,
          mime: upload.mime,
          model: data.asrModel,
        });
        console.log(
          `[worker] upload ${data.uploadId} transcribed: ` +
            `${asrResult.segments.length} segments ` +
            `(${(asrResult.fullText ?? '').length} chars) in ` +
            `${((Date.now() - asrStartedAt) / 1000).toFixed(1)}s`,
        );

        let segments: Segment[] = asrResult.segments;
        const inlineTurns: SpeakerTurn[] | undefined = asrResult.turns;

        // 2) Diarization (only if ASR didn't already return turns)
        let turns: SpeakerTurn[] = inlineTurns ?? [];
        if (turns.length === 0 && data.diarizationProvider && data.diarizationProvider !== 'none') {
          await publishProgress(redis, {
            uploadId: data.uploadId,
            status: 'diarizing',
            message: 'Identifying speakers',
            progress: 0.4,
          });
          const diar = createDiarizationProviderFromEnv(env, data.diarizationProvider);
          const diarResult = await diar.diarize({
            filePath: data.filePath,
            mime: upload.mime,
          });
          turns = diarResult.turns;
        }

        // 3) Alignment
        await publishProgress(redis, {
          uploadId: data.uploadId,
          status: 'aligning',
          message: 'Aligning speakers with transcript',
          progress: 0.6,
        });
        segments = assignSpeakersToSegments(segments, turns);

        const speakerList = uniqueSpeakers(segments);

        // 4) Speaker naming pass
        await publishProgress(redis, {
          uploadId: data.uploadId,
          status: 'naming',
          message: 'Suggesting speaker names',
          progress: 0.7,
        });
        const llm = createLLMProviderFromEnv(env, {
          id: data.llmProvider,
          model: data.llmModel,
        });
        const speakerMap: Record<string, string | null> = {};
        if (speakerList.length > 1) {
          try {
            const transcriptText = segments
              .slice(0, 60)
              .map((s) => `${s.speaker}: ${s.text}`)
              .join('\n');
            const namingUser = `${SPEAKER_NAMING_PROMPT}\n\nSpeakers: ${speakerList.join(', ')}\n\nTranscript excerpt:\n${transcriptText}`;
            const namingResult = await llm.complete({
              system: 'You identify speakers from transcripts. Return strict JSON.',
              user: namingUser,
              json: true,
              maxTokens: 512,
            });
            const parsed = parseJsonLoose(namingResult.text);
            const validated = SpeakerNameSuggestionSchema.safeParse(parsed);
            if (validated.success) {
              for (const [k, v] of Object.entries(validated.data)) {
                speakerMap[k] = v;
              }
            }
          } catch (err) {
            console.warn('[worker] speaker naming failed, continuing without suggestions:', err);
          }
        }

        // 5) Summarize + structure
        await publishProgress(redis, {
          uploadId: data.uploadId,
          status: 'summarizing',
          message: 'Generating notes',
          progress: 0.85,
        });

        const fullTranscriptText = segments
          .map((s) => `[${formatTime(s.start)}] ${s.speaker}: ${s.text}`)
          .join('\n');

        const summaryUser = `${SUMMARIZE_PROMPT}\n\nTranscript:\n${fullTranscriptText.slice(0, 120_000)}`;

        const summaryResult = await llm.complete({
          system: 'You are a precise note-taker. Return strict JSON.',
          user: summaryUser,
          json: true,
          maxTokens: 4096,
        });

        let notes: Notes;
        try {
          const parsed = parseJsonLoose(summaryResult.text);
          const validated = NotesSchema.safeParse(parsed);
          if (!validated.success) {
            console.warn('[worker] notes validation failed, retrying with reinforcement');
            const retry = await llm.complete({
              system: 'You are a precise note-taker. Return strict JSON only, no markdown fences.',
              user: summaryUser + '\n\nREMINDER: Return ONLY the JSON object, no other text.',
              json: true,
              maxTokens: 4096,
            });
            const retryParsed = parseJsonLoose(retry.text);
            const retryValidated = NotesSchema.safeParse(retryParsed);
            if (!retryValidated.success) {
              throw new Error('LLM returned invalid notes JSON after retry');
            }
            notes = retryValidated.data;
          } else {
            notes = validated.data;
          }
        } catch (err) {
          console.error('[worker] notes parsing error:', err);
          notes = {
            summary: summaryResult.text.slice(0, 500),
            keyPoints: [],
            actionItems: [],
            decisions: [],
            chapters: [],
            highlights: [],
          };
        }

        // 6) Persist
        const transcriptId = nanoid(16);
        const notesId = nanoid(16);
        const fullText = segments.map((s) => s.text).join(' ');

        await db.insert(schema.transcripts).values({
          id: transcriptId,
          uploadId: data.uploadId,
          language: asrResult.language,
          fullText,
          segmentsJson: JSON.stringify(segments),
          speakersJson: JSON.stringify(
            speakerList.map((label) => ({
              id: nanoid(8),
              originalLabel: label,
              suggestedName: speakerMap[label] ?? null,
            })),
          ),
        });

        await db.insert(schema.notes).values({
          id: notesId,
          uploadId: data.uploadId,
          summary: notes.summary,
          keyPointsJson: JSON.stringify(notes.keyPoints),
          actionItemsJson: JSON.stringify(notes.actionItems),
          decisionsJson: JSON.stringify(notes.decisions),
          chaptersJson: JSON.stringify(notes.chapters),
          highlightsJson: JSON.stringify(notes.highlights),
          llmModel: data.llmModel ?? null,
        });

        for (const [label, name] of Object.entries(speakerMap)) {
          await db
            .insert(schema.speakerLabels)
            .values({
              id: nanoid(8),
              uploadId: data.uploadId,
              originalLabel: label,
              suggestedName: name,
            })
            .onConflictDoNothing();
        }

        // Try to detect duration
        try {
          await stat(data.filePath);
          await db
            .update(schema.uploads)
            .set({
              status: 'done',
              durationSec: estimateDuration(segments),
              completedAt: new Date(),
            })
            .where(eq(schema.uploads.id, data.uploadId));
        } catch {
          await db
            .update(schema.uploads)
            .set({ status: 'done', completedAt: new Date() })
            .where(eq(schema.uploads.id, data.uploadId));
        }

        await publishProgress(redis, {
          uploadId: data.uploadId,
          status: 'done',
          message: 'Complete',
          progress: 1,
        });
        console.log(`[worker] upload ${data.uploadId} done`);
      } catch (err: any) {
        console.error(`[worker] upload ${data.uploadId} failed:`, err);
        const db = getDb(env);
        await db
          .update(schema.uploads)
          .set({ status: 'failed', error: String(err?.message ?? err) })
          .where(eq(schema.uploads.id, data.uploadId));
        await publishProgress(redis, {
          uploadId: data.uploadId,
          status: 'failed',
          error: String(err?.message ?? err),
        });
        throw err;
      }
    },
    {
      connection: redis,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  console.log('[worker] started, listening for jobs');
  return worker;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function estimateDuration(segments: Segment[]): number {
  if (segments.length === 0) return 0;
  const last = segments[segments.length - 1];
  if (!last) return 0;
  return Math.ceil(last.end);
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        /* fall through */
      }
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error('Could not parse JSON from LLM response');
  }
}