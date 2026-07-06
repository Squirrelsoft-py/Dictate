import { readFile } from 'node:fs/promises';
import { fetch as undiciFetch } from 'undici';
import type { ASRProvider, ASRInput, ASROutput } from '@dictate/shared/providers';
import type { Segment, SpeakerTurn } from '@dictate/shared/schemas';

export function createAssemblyAIASRProvider(apiKey: string): ASRProvider {
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is required for the AssemblyAI provider');
  }
  return {
    id: 'assemblyai',
    displayName: 'AssemblyAI',
    async transcribe(input: ASRInput): Promise<ASROutput> {
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
          language_detection: !input.language,
          language_code: input.language,
        }),
      });
      if (!submitRes.ok) {
        const text = await submitRes.text().catch(() => '');
        throw new Error(`AssemblyAI submit failed: ${submitRes.status} ${text.slice(0, 200)}`);
      }
      const submitData: any = await submitRes.json();
      const transcriptId = submitData.id;

      const poll = async () => {
        for (let i = 0; i < 600; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const r = await undiciFetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
            headers: { authorization: apiKey },
          });
          const d: any = await r.json();
          if (d.status === 'completed') return d;
          if (d.status === 'error') throw new Error(`AssemblyAI error: ${d.error}`);
        }
        throw new Error('AssemblyAI timed out');
      };
      const result = await poll();

      const segments: Segment[] = [];
      const turns: SpeakerTurn[] = [];
      for (const utt of result.utterances ?? []) {
        const speaker = utt.speaker ? `Speaker ${utt.speaker}` : 'Speaker 0';
        segments.push({
          start: Number(utt.start) / 1000,
          end: Number(utt.end) / 1000,
          text: String(utt.text).trim(),
          speaker,
        });
        turns.push({
          start: Number(utt.start) / 1000,
          end: Number(utt.end) / 1000,
          speaker,
        });
      }
      return {
        language: result.language_code ?? input.language ?? 'en',
        segments,
        turns,
        fullText: result.text ?? segments.map((s) => s.text).join(' '),
      };
    },
  };
}