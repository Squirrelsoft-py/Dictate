import { z } from 'zod';
import { PROVIDER_IDS } from '@dictate/shared';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATA_DIR: z.string().default('/data'),
  REDIS_URL: z.string().default('redis://redis:6379'),
  BETTER_AUTH_SECRET: z.string().min(16).default('change-me-please-change-me-please'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3001'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  UPLOAD_RETENTION_DAYS: z.coerce.number().int().nonnegative().default(0),
  LOCAL_ASR_ENDPOINT: z.string().optional().default(''),
  ADMIN_ASR_PROVIDER: z.enum(PROVIDER_IDS.ASR).default('local'),
  ADMIN_DIARIZATION_PROVIDER: z.enum(PROVIDER_IDS.DIARIZATION).default('local'),
  ADMIN_LLM_PROVIDER: z.enum(PROVIDER_IDS.LLM).default('openai-compat'),
  OPENAI_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),
  DEEPGRAM_API_KEY: z.string().optional().default(''),
  ASSEMBLYAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENAI_COMPAT_BASE_URL: z.string().optional().default(''),
  OPENAI_COMPAT_API_KEY: z.string().optional().default(''),
  OPENAI_COMPAT_MODEL: z.string().optional().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}