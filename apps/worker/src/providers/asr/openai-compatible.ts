import { readFile } from 'node:fs/promises';
import { FormData, fetch as undiciFetch } from 'undici';
import type { ASRProvider, ASRInput, ASROutput } from '@dictate/shared/providers';
import type { Segment } from '@dictate/shared/schemas';

export function createOpenAICompatibleASRProvider(
  baseURL: string,
  apiKey: string,
  defaultModel: string,
): ASRProvider {
  if (!baseURL) {
    throw new Error('OPENAI_COMPAT_BASE_URL is required for the OpenAI-compatible ASR provider');
  }
  const url = `${baseURL.replace(/\/$/, '')}/audio/transcriptions`;

  return {
    id: 'openai-compatible',
    displayName: 'OpenAI-compatible ASR',
    async transcribe(input: ASRInput): Promise<ASROutput> {
      const fileBuffer = await readFile(input.filePath);
      const form = new FormData();
      form.set('file', new Blob([fileBuffer], { type: input.mime || 'audio/mpeg' }), input.filePath);
      form.set('model', input.model ?? defaultModel ?? 'whisper-1');
      form.set('response_format', 'verbose_json');
      if (input.language) form.set('language', input.language);

      const res = await undiciFetch(url, {
        method: 'POST',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI-compat ASR failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const data: any = await res.json();
      const segments: Segment[] = (data.segments ?? []).map((s: any) => ({
        start: Number(s.start ?? 0),
        end: Number(s.end ?? 0),
        text: String(s.text ?? '').trim(),
        speaker: 'Speaker 0',
      }));
      return {
        language: String(data.language ?? input.language ?? 'en'),
        segments,
        fullText: String(data.text ?? ''),
      };
    },
  };
}