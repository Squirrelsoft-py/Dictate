import type { ASRProvider } from '@dictate/shared/providers';
import type { Env } from '../../lib/env.js';
import { createLocalASRProvider } from './local.js';
import { createOpenAIWhisperProvider, createGroqWhisperProvider } from './openai.js';
import { createOpenAICompatibleASRProvider } from './openai-compatible.js';
import { createDeepgramASRProvider } from './deepgram.js';
import { createAssemblyAIASRProvider } from './assemblyai.js';

export function createASRProviderFromEnv(env: Env, override?: { id: string }): ASRProvider {
  const id = override?.id ?? env.ADMIN_ASR_PROVIDER;
  switch (id) {
    case 'local':
      return createLocalASRProvider(env.LOCAL_ASR_ENDPOINT);
    case 'openai-whisper':
      return createOpenAIWhisperProvider(env.OPENAI_API_KEY);
    case 'groq':
      return createGroqWhisperProvider(env.GROQ_API_KEY);
    case 'deepgram':
      return createDeepgramASRProvider(env.DEEPGRAM_API_KEY);
    case 'assemblyai':
      return createAssemblyAIASRProvider(env.ASSEMBLYAI_API_KEY);
    case 'openai-compatible':
      return createOpenAICompatibleASRProvider(
        env.OPENAI_COMPAT_BASE_URL,
        env.OPENAI_COMPAT_API_KEY,
        env.OPENAI_COMPAT_MODEL,
      );
    default:
      throw new Error(`Unknown ASR provider: ${id}`);
  }
}

export {
  createLocalASRProvider,
  createOpenAIWhisperProvider,
  createGroqWhisperProvider,
  createOpenAICompatibleASRProvider,
  createDeepgramASRProvider,
  createAssemblyAIASRProvider,
};