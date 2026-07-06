import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { FormData, fetch as undiciFetch } from 'undici';
import type { DiarizationProvider, DiarizationInput, DiarizationOutput } from '@dictate/shared/providers';
import type { SpeakerTurn } from '@dictate/shared/schemas';
import type { Env } from '../../lib/env.js';

export function createLocalDiarizationProvider(endpoint: string): DiarizationProvider {
  if (!endpoint) {
    throw new Error('LOCAL_ASR_ENDPOINT is required for local diarization');
  }
  return {
    id: 'local',
    displayName: 'Local (pyannote via Whisper ASR webservice)',
    async diarize(input: DiarizationInput): Promise<DiarizationOutput> {
      const url = new URL('/asr', endpoint);
      url.searchParams.set('task', 'transcribe');
      url.searchParams.set('output', 'json');
      url.searchParams.set('diarization', 'true');

      const fileBuffer = await readFile(input.filePath);
      const form = new FormData();
      form.set('audio_file', new Blob([fileBuffer], { type: input.mime || 'audio/mpeg' }), basename(input.filePath));

      const res = await undiciFetch(url.toString(), { method: 'POST', body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Local diarization failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const data: any = await res.json();
      const turns: SpeakerTurn[] = [];
      for (const seg of data.segments ?? []) {
        const raw = String(seg.speaker ?? seg.speaker_id ?? 'SPEAKER_0');
        const speaker = raw.startsWith('SPEAKER_') ? `Speaker ${raw.replace('SPEAKER_', '')}` : raw;
        turns.push({
          start: Number(seg.start ?? seg.start_ts ?? 0),
          end: Number(seg.end ?? seg.end_ts ?? 0),
          speaker,
        });
      }
      return { turns };
    },
  };
}

export function createDeepgramDiarizationProvider(apiKey: string): DiarizationProvider {
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is required for Deepgram diarization');
  }
  return {
    id: 'deepgram',
    displayName: 'Deepgram',
    async diarize(input: DiarizationInput): Promise<DiarizationOutput> {
      const fileBuffer = await readFile(input.filePath);
      const url = new URL('https://api.deepgram.com/v1/listen');
      url.searchParams.set('model', 'nova-2');
      url.searchParams.set('diarize', 'true');
      url.searchParams.set('utterances', 'true');
      const res = await undiciFetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': input.mime || 'audio/mpeg',
        },
        body: fileBuffer,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Deepgram diarization failed: ${res.status} ${t.slice(0, 200)}`);
      }
      const data: any = await res.json();
      const turns: SpeakerTurn[] = [];
      const utts = data.results?.utterances ?? [];
      for (const u of utts) {
        turns.push({
          start: Number(u.start),
          end: Number(u.end),
          speaker: `Speaker ${u.speaker ?? 0}`,
        });
      }
      return { turns };
    },
  };
}

export function createAssemblyAIDiarizationProvider(apiKey: string): DiarizationProvider {
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is required for AssemblyAI diarization');
  }
  return {
    id: 'assemblyai',
    displayName: 'AssemblyAI',
    async diarize(input: DiarizationInput): Promise<DiarizationOutput> {
      const fileBuffer = await readFile(input.filePath);
      const submitRes = await undiciFetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: `data:${input.mime || 'audio/mpeg'};base64,${fileBuffer.toString('base64')}`,
          speaker_labels: true,
        }),
      });
      if (!submitRes.ok) {
        const t = await submitRes.text().catch(() => '');
        throw new Error(`AssemblyAI diarization submit failed: ${submitRes.status} ${t.slice(0, 200)}`);
      }
      const submitData: any = await submitRes.json();
      const id = submitData.id;
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const r = await undiciFetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
          headers: { authorization: apiKey },
        });
        const d: any = await r.json();
        if (d.status === 'completed') {
          const turns: SpeakerTurn[] = (d.utterances ?? []).map((u: any) => ({
            start: Number(u.start) / 1000,
            end: Number(u.end) / 1000,
            speaker: `Speaker ${u.speaker ?? 0}`,
          }));
          return { turns };
        }
        if (d.status === 'error') throw new Error(`AssemblyAI diarization error: ${d.error}`);
      }
      throw new Error('AssemblyAI diarization timed out');
    },
  };
}

export function createNoopDiarizationProvider(): DiarizationProvider {
  return {
    id: 'none',
    displayName: 'No diarization',
    async diarize(_input: DiarizationInput): Promise<DiarizationOutput> {
      return { turns: [] };
    },
  };
}

export function createDiarizationProviderFromEnv(env: Env, id?: string): DiarizationProvider {
  const choice = id ?? env.ADMIN_DIARIZATION_PROVIDER;
  switch (choice) {
    case 'local':
      return createLocalDiarizationProvider(env.LOCAL_ASR_ENDPOINT);
    case 'deepgram':
      return createDeepgramDiarizationProvider(env.DEEPGRAM_API_KEY);
    case 'assemblyai':
      return createAssemblyAIDiarizationProvider(env.ASSEMBLYAI_API_KEY);
    case 'none':
      return createNoopDiarizationProvider();
    default:
      throw new Error(`Unknown diarization provider: ${choice}`);
  }
}