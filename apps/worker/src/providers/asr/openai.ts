import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import OpenAI from 'openai';
import type { ASRProvider, ASRInput, ASROutput } from '@dictate/shared/providers';
import type { Segment } from '@dictate/shared/schemas';

export function createOpenAIWhisperProvider(apiKey: string): ASRProvider {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI Whisper provider');
  }
  const client = new OpenAI({ apiKey });

  return {
    id: 'openai-whisper',
    displayName: 'OpenAI Whisper',
    async transcribe(input: ASRInput): Promise<ASROutput> {
      const fileBuffer = await readFile(input.filePath);
      const file = new File([fileBuffer], basename(input.filePath), {
        type: input.mime || 'audio/mpeg',
      });
      const transcription = await client.audio.transcriptions.create({
        file,
        model: (input.model as any) ?? 'whisper-1',
        language: input.language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      const segments: Segment[] = (transcription.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        speaker: 'Speaker 0',
      }));

      return {
        language: transcription.language ?? input.language ?? 'en',
        segments,
        fullText: transcription.text,
      };
    },
  };
}

export function createGroqWhisperProvider(apiKey: string): ASRProvider {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is required for the Groq Whisper provider');
  }
  const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });

  return {
    id: 'groq',
    displayName: 'Groq Whisper',
    async transcribe(input: ASRInput): Promise<ASROutput> {
      const fileBuffer = await readFile(input.filePath);
      const file = new File([fileBuffer], basename(input.filePath), {
        type: input.mime || 'audio/mpeg',
      });
      const transcription = await client.audio.transcriptions.create({
        file,
        model: (input.model as any) ?? 'whisper-large-v3',
        language: input.language,
        response_format: 'verbose_json',
      });

      const segments: Segment[] = (transcription.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        speaker: 'Speaker 0',
      }));

      return {
        language: transcription.language ?? input.language ?? 'en',
        segments,
        fullText: transcription.text,
      };
    },
  };
}