import { z } from 'zod';

export const JobTypeSchema = z.enum(['process-upload']);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobDataSchema = z.object({
  uploadId: z.string(),
  userId: z.string(),
  filePath: z.string(),
  asrProvider: z.string(),
  asrModel: z.string().optional(),
  diarizationProvider: z.string(),
  llmProvider: z.string(),
  llmModel: z.string().optional(),
});
export type JobData = z.infer<typeof JobDataSchema>;

export const ProgressEventSchema = z.object({
  uploadId: z.string(),
  status: z.string(),
  stage: z.string().optional(),
  message: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;