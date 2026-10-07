import type { ConfigService } from '@nestjs/config';
import { createLlmProvider } from './create-llm-provider';

function config(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('createLlmProvider', () => {
  it('uses OpenAI when selected and a key is present', () => {
    const provider = createLlmProvider(
      config({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' }),
    );
    expect(provider.providerName).toBe('openai');
  });

  it('falls back to Ollama without a key', () => {
    const provider = createLlmProvider(config({ LLM_PROVIDER: 'openai' }));
    expect(provider.providerName).toBe('ollama');
  });

  it('defaults to Ollama', () => {
    expect(createLlmProvider(config({})).providerName).toBe('ollama');
  });
});
