import { z } from 'zod';

export const ASRProviderIdSchema = z.enum([
  'local',
  'openai-whisper',
  'groq',
  'deepgram',
  'assemblyai',
  'openai-compatible',
]);
export type ASRProviderId = z.infer<typeof ASRProviderIdSchema>;

export const DiarizationProviderIdSchema = z.enum(['local', 'deepgram', 'assemblyai', 'none']);
export type DiarizationProviderId = z.infer<typeof DiarizationProviderIdSchema>;

export const LLMProviderIdSchema = z.enum(['openai-compat', 'openai', 'anthropic']);
export type LLMProviderId = z.infer<typeof LLMProviderIdSchema>;

export const CreateUploadSchema = z.object({
  filename: z.string().min(1).max(512),
  sizeBytes: z.number().int().positive(),
  mime: z.string().min(1).max(128),
  asrProvider: ASRProviderIdSchema.optional(),
  asrModel: z.string().optional(),
  diarizationProvider: DiarizationProviderIdSchema.optional(),
  llmProvider: LLMProviderIdSchema.optional(),
  llmModel: z.string().optional(),
});
export type CreateUploadInput = z.infer<typeof CreateUploadSchema>;

export const RenameSpeakerSchema = z.object({
  speakerId: z.string(),
  customName: z.string().min(1).max(128),
});
export type RenameSpeakerInput = z.infer<typeof RenameSpeakerSchema>;

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(64),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type CreateTagInput = z.infer<typeof CreateTagSchema>;