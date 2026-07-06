import { readFile } from 'node:fs/promises';
import { fetch as undiciFetch } from 'undici';
import type { ASRProvider, ASRInput, ASROutput } from '@dictate/shared/providers';
import type { Segment, SpeakerTurn } from '@dictate/shared/schemas';

export function createDeepgramASRProvider(apiKey: string): ASRProvider {
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY is required for the Deepgram provider');
  }
  return {
    id: 'deepgram',
    displayName: 'Deepgram Nova',
    async transcribe(input: ASRInput): Promise<ASROutput> {
      const fileBuffer = await readFile(input.filePath);
      const url = new URL('https://api.deepgram.com/v1/listen');
      url.searchParams.set('model', input.model ?? 'nova-2');
      url.searchParams.set('smart_format', 'true');
      url.searchParams.set('diarize', 'true');
      url.searchParams.set('utterances', 'true');
      url.searchParams.set('detect_language', input.language ? 'false' : 'true');
      if (input.language) url.searchParams.set('language', input.language);

      const res = await undiciFetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': input.mime || 'audio/mpeg',
        },
        body: fileBuffer,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Deepgram failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const data: any = await res.json();

      const segments: Segment[] = [];
      const turns: SpeakerTurn[] = [];
      const channel = data.results?.channels?.[0];
      const alternatives = channel?.alternatives?.[0];
      const language = data.results?.detected_language ?? input.language ?? 'en';

      if (alternatives?.paragraphs?.paragraphs) {
        for (const para of alternatives.paragraphs.paragraphs) {
          for (const sent of para.sentences ?? []) {
            const speaker = `Speaker ${sent.speaker ?? 0}`;
            segments.push({
              start: Number(sent.start),
              end: Number(sent.end),
              text: String(sent.text).trim(),
              speaker,
            });
            turns.push({ start: Number(sent.start), end: Number(sent.end), speaker });
          }
        }
      }

      const fullText = alternatives?.transcript ?? segments.map((s) => s.text).join(' ');
      return { language, segments, turns, fullText };
    },
  };
}