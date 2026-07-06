import type { ASRProvider, DiarizationProvider, LLMProvider } from './types.js';

export interface ProviderRegistry {
  asr: Map<string, ASRProvider>;
  diarization: Map<string, DiarizationProvider>;
  llm: Map<string, LLMProvider>;
}

export function createRegistry(): ProviderRegistry {
  return {
    asr: new Map(),
    diarization: new Map(),
    llm: new Map(),
  };
}

export class ProviderNotFoundError extends Error {
  constructor(kind: 'asr' | 'diarization' | 'llm', id: string) {
    super(`Unknown ${kind} provider: "${id}"`);
    this.name = 'ProviderNotFoundError';
  }
}

export function getASRProvider(registry: ProviderRegistry, id: string): ASRProvider {
  const p = registry.asr.get(id);
  if (!p) throw new ProviderNotFoundError('asr', id);
  return p;
}

export function getDiarizationProvider(
  registry: ProviderRegistry,
  id: string,
): DiarizationProvider {
  const p = registry.diarization.get(id);
  if (!p) throw new ProviderNotFoundError('diarization', id);
  return p;
}

export function getLLMProvider(registry: ProviderRegistry, id: string): LLMProvider {
  const p = registry.llm.get(id);
  if (!p) throw new ProviderNotFoundError('llm', id);
  return p;
}