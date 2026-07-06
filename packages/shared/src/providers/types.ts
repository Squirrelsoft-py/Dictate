import { z } from 'zod';
import type { Segment, SpeakerTurn } from '../schemas/transcript.js';

export interface ASRProvider {
  readonly id: string;
  readonly displayName: string;
  transcribe(input: ASRInput): Promise<ASROutput>;
}

export interface ASRInput {
  filePath: string;
  mime: string;
  language?: string;
  model?: string;
}

export interface ASROutput {
  language: string;
  segments: Segment[];
  turns?: SpeakerTurn[];
  fullText?: string;
}

export interface DiarizationProvider {
  readonly id: string;
  readonly displayName: string;
  diarize(input: DiarizationInput): Promise<DiarizationOutput>;
}

export interface DiarizationInput {
  filePath: string;
  mime: string;
  speakers?: number;
}

export interface DiarizationOutput {
  turns: SpeakerTurn[];
}

export interface LLMProvider {
  readonly id: string;
  readonly displayName: string;
  complete(input: LLMInput): Promise<LLMOutput>;
}

export const LLMInputSchema = z.object({
  system: z.string(),
  user: z.string(),
  json: z.boolean().default(false),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
export type LLMInput = z.infer<typeof LLMInputSchema>;

export interface LLMOutput {
  text: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}