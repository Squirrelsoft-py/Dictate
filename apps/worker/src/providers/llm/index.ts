import OpenAI from 'openai';
import type { LLMProvider, LLMInput, LLMOutput } from '@dictate/shared/providers';
import type { Env } from '../../lib/env.js';

export function createOpenAIProvider(apiKey: string): LLMProvider {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI provider');
  }
  const client = new OpenAI({ apiKey });

  return {
    id: 'openai',
    displayName: 'OpenAI',
    async complete(input: LLMInput): Promise<LLMOutput> {
      const completion = await client.chat.completions.create({
        model: input.model ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        response_format: input.json ? { type: 'json_object' } : undefined,
      });
      const text = completion.choices[0]?.message?.content ?? '';
      return {
        text,
        model: completion.model,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    },
  };
}

export function createOpenAICompatibleProvider(
  baseURL: string,
  apiKey: string,
  defaultModel: string,
): LLMProvider {
  if (!baseURL) {
    throw new Error('OPENAI_COMPAT_BASE_URL is required for the OpenAI-compat provider');
  }
  const client = new OpenAI({ apiKey: apiKey || 'no-key', baseURL });

  return {
    id: 'openai-compat',
    displayName: 'OpenAI-compatible (any LLM endpoint)',
    async complete(input: LLMInput): Promise<LLMOutput> {
      const completion = await client.chat.completions.create({
        model: input.model ?? defaultModel ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        response_format: input.json ? { type: 'json_object' } : undefined,
      } as any);
      const text = (completion.choices[0]?.message?.content as string) ?? '';
      return {
        text,
        model: completion.model,
        usage: (completion as any).usage
          ? {
              promptTokens: (completion as any).usage.prompt_tokens,
              completionTokens: (completion as any).usage.completion_tokens,
              totalTokens: (completion as any).usage.total_tokens,
            }
          : undefined,
      };
    },
  };
}

export function createAnthropicProvider(apiKey: string): LLMProvider {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for the Anthropic provider');
  }
  let client: any = null;
  const getClient = async () => {
    if (client) return client;
    const mod = await import('@anthropic-ai/sdk');
    client = new mod.default({ apiKey });
    return client;
  };

  return {
    id: 'anthropic',
    displayName: 'Anthropic Claude',
    async complete(input: LLMInput): Promise<LLMOutput> {
      const c = await getClient();
      const message = await c.messages.create({
        model: input.model ?? 'claude-3-5-sonnet-latest',
        max_tokens: input.maxTokens ?? 4096,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
      });
      const text = (message.content[0] as any)?.text ?? '';
      return {
        text,
        model: message.model,
        usage: message.usage
          ? {
              promptTokens: message.usage.input_tokens,
              completionTokens: message.usage.output_tokens,
              totalTokens: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
            }
          : undefined,
      };
    },
  };
}

export function createLLMProviderFromEnv(env: Env, override?: { id: string; model?: string }): LLMProvider {
  const id = override?.id ?? env.ADMIN_LLM_PROVIDER;
  switch (id) {
    case 'openai':
      return createOpenAIProvider(env.OPENAI_API_KEY);
    case 'openai-compat':
      return createOpenAICompatibleProvider(
        env.OPENAI_COMPAT_BASE_URL,
        env.OPENAI_COMPAT_API_KEY,
        env.OPENAI_COMPAT_MODEL,
      );
    case 'anthropic':
      return createAnthropicProvider(env.ANTHROPIC_API_KEY);
    default:
      throw new Error(`Unknown LLM provider: ${id}`);
  }
}