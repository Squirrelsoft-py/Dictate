import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { FormData, fetch as undiciFetch } from 'undici';
import type { ASRProvider, ASRInput, ASROutput } from '@dictate/shared/providers';
import type { Segment } from '@dictate/shared/schemas';

export class LocalASRError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'LocalASRError';
  }
}

export function createLocalASRProvider(endpoint: string): ASRProvider {
  if (!endpoint) {
    throw new LocalASRError(
      'LOCAL_ASR_ENDPOINT is not configured. Set it to your onerahmet/whisper-asr-webservice URL, or pick a cloud ASR provider.',
    );
  }

  return {
    id: 'local',
    displayName: 'Local (Whisper + pyannote)',
    async transcribe(input: ASRInput): Promise<ASROutput> {
      const url = new URL('/asr', endpoint);
      url.searchParams.set('task', 'transcribe');
      url.searchParams.set('output', 'json');
      url.searchParams.set('diarization', 'true');
      url.searchParams.set('encode', 'true');
      if (input.language) url.searchParams.set('language', input.language);
      if (input.model) url.searchParams.set('model', input.model);

      const fileBuffer = await readFile(input.filePath);
      const form = new FormData();
      const blob = new Blob([fileBuffer], { type: input.mime || 'audio/mpeg' });
      form.set('audio_file', blob, basename(input.filePath));

      const res = await undiciFetch(url.toString(), {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new LocalASRError(
          `Local ASR failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
          res.status,
        );
      }

      const data: any = await res.json();
      return normalizeWhisperAsrWebservice(data);
    },
  };
}

function normalizeWhisperAsrWebservice(data: any): ASROutput {
  const segments: Segment[] = [];
  const speakerSet = new Map<string, string>();

  const rawSegments = Array.isArray(data.segments)
    ? data.segments
    : Array.isArray(data.text)
      ? data.text
      : [];

  for (const seg of rawSegments) {
    const start = Number(seg.start ?? seg.start_ts ?? 0);
    const end = Number(seg.end ?? seg.end_ts ?? start);
    const text = String(seg.text ?? '').trim();
    const rawSpeaker = String(seg.speaker ?? seg.speaker_id ?? 'Speaker 0');
    const speakerLabel = rawSpeaker.startsWith('SPEAKER_')
      ? `Speaker ${rawSpeaker.replace('SPEAKER_', '')}`
      : rawSpeaker;
    speakerSet.set(speakerLabel, speakerLabel);

    const words = Array.isArray(seg.words)
      ? seg.words.map((w: any) => ({
          start: Number(w.start ?? w.start_ts ?? 0),
          end: Number(w.end ?? w.end_ts ?? 0),
          text: String(w.word ?? w.text ?? ''),
        }))
      : undefined;

    if (text) {
      segments.push({ start, end, text, speaker: speakerLabel, words });
    }
  }

  const fullText =
    typeof data.text === 'string'
      ? data.text
      : segments.map((s) => s.text).join(' ');

  const language = String(data.language ?? data.detected_language ?? 'auto');

  return { language, segments, fullText };
}