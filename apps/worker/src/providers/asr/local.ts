import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { FormData, fetch as undiciFetch } from 'undici';
import type { ASRProvider, ASRInput, ASROutput } from '@dictate/shared/providers';
import type { Segment } from '@dictate/shared/schemas';

export class LocalASRError extends Error {
  constructor(
    message: string,
    public status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LocalASRError';
  }
}

export function createLocalASRProvider(endpoint: string): ASRProvider {
  if (!endpoint) {
    throw new LocalASRError(
      'LOCAL_ASR_ENDPOINT is not configured. Set it to your onerahmet/whisper-asr-webservice URL, or pick a cloud ASR provider.',
    );
  }

  const rootUrl = new URL('/', endpoint);
  const asrUrl = new URL('/asr', endpoint);

  // 10-minute hard cap on a single transcribe. A CPU small-model
  // transcribe of an hour of audio is ~5-15 min. Anything longer
  // means the asr is wedged on a hung request and we should fail
  // fast so BullMQ can retry on a different worker / after restart.
  const TRANSCRIBE_TIMEOUT_MS = 10 * 60 * 1000;

  async function ping(timeoutMs = 3000): Promise<{ up: boolean; status?: number; cause?: unknown }> {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const res = await undiciFetch(rootUrl.toString(), { signal: ac.signal });
      clearTimeout(timer);
      return { up: res.ok, status: res.status };
    } catch (err) {
      return { up: false, cause: err };
    }
  }

  return {
    id: 'local',
    displayName: 'Local (Whisper + pyannote)',
    async transcribe(input: ASRInput): Promise<ASROutput> {
      // Step 1: is the server alive at all? The asr sidecar's HTTP
      // server starts immediately, but the Whisper model is downloaded
      // on the first /asr request. A clean "not ready" signal here
      // gives BullMQ a clean retry instead of a generic fetch failure.
      const health = await ping();
      if (!health.up) {
        throw new LocalASRError(
          `Local ASR not reachable at ${rootUrl} (status=${health.status ?? 'unreachable'})`,
          health.status,
        );
      }

      // Step 2: build the transcribe request.
      // Re-set params each call since asrUrl.searchParams is shared
      // (URL.searchParams persists across .set() calls).
      asrUrl.search = '';
      asrUrl.searchParams.set('task', 'transcribe');
      asrUrl.searchParams.set('output', 'json');
      asrUrl.searchParams.set('diarization', 'true');
      asrUrl.searchParams.set('encode', 'true');
      if (input.language) asrUrl.searchParams.set('language', input.language);
      if (input.model) asrUrl.searchParams.set('model', input.model);

      // Read the file. We bound this with a timeout too so a missing
      // or unreadable file fails fast instead of hanging the worker.
      let fileBuffer: Buffer;
      try {
        fileBuffer = await readFile(input.filePath);
      } catch (err) {
        throw new LocalASRError(
          `Cannot read audio file ${input.filePath}: ${(err as Error).message}`,
          undefined,
          { cause: err },
        );
      }

      const form = new FormData();
      const blob = new Blob([fileBuffer], { type: input.mime || 'audio/mpeg' });
      form.set('audio_file', blob, basename(input.filePath));

      // Step 3: POST with a hard timeout. The asr with a single
      // uvicorn worker can only process one request at a time, so a
      // hung transcribe blocks everything. Timeout ensures we fail
      // fast and let BullMQ retry.
      let res: Response;
      try {
        res = await undiciFetch(asrUrl.toString(), {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
        });
      } catch (err) {
        const msg = (err as Error).name === 'TimeoutError'
          ? `transcribe timed out after ${TRANSCRIBE_TIMEOUT_MS / 1000}s (asr is busy or wedged — try fewer parallel uploads)`
          : `network error reaching ${asrUrl}: ${(err as Error).message}`;
        throw new LocalASRError(msg, undefined, { cause: err });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new LocalASRError(
          `Local ASR ${res.status} ${res.statusText} — ${text.slice(0, 300)}`,
          res.status,
        );
      }

      // Step 4: parse the response. If the asr returns malformed
      // JSON (model half-loaded, partial download, etc.) throw
      // a clear error rather than letting the pipeline fail later
      // with a confusing "undefined.segments" error.
      let data: any;
      try {
        data = await res.json();
      } catch (err) {
        throw new LocalASRError(
          `Local ASR returned non-JSON response (status ${res.status})`,
          res.status,
          { cause: err },
        );
      }

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
