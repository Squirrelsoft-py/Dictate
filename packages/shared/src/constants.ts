export const APP_NAME = 'Dictate';

export const UPLOAD_STATUSES = [
  'queued',
  'transcribing',
  'diarizing',
  'aligning',
  'naming',
  'summarizing',
  'done',
  'failed',
] as const;

export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const JOB_PROGRESS_CHANNEL_PREFIX = 'job:';
export const JOB_PROGRESS_CHANNEL_SUFFIX = ':progress';

export const DEFAULT_SPEAKER_COLORS = [
  '#FF6B35',
  '#2EC4B6',
  '#E71D36',
  '#FFBF69',
  '#3A86FF',
  '#8338EC',
  '#06A77D',
  '#D90368',
] as const;

export const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export const PROVIDER_IDS = {
  ASR: ['local', 'openai-whisper', 'groq', 'deepgram', 'assemblyai', 'openai-compatible'] as const,
  DIARIZATION: ['local', 'deepgram', 'assemblyai', 'none'] as const,
  LLM: ['openai-compat', 'openai', 'anthropic'] as const,
} as const;