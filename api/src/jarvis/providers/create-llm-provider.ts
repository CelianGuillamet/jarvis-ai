import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { LLMProvider } from './llm.provider';
import { selectedModelProvider } from './model-selection';
import { OllamaProvider } from './ollama.provider';
import { OpenAIProvider } from './openai.provider';

export function createLlmProvider(config: ConfigService): LLMProvider {
  const logger = new Logger('LlmProvider');
  const llmProvider = (config.get<string>('LLM_PROVIDER') || '').toLowerCase();
  const openAiKey = config.get<string>('OPENAI_API_KEY')?.trim();
  const shouldUseOpenAi =
    selectedModelProvider(llmProvider, openAiKey) === 'openai';

  if (shouldUseOpenAi && openAiKey) {
    const primary = config.get<string>('OPENAI_MODEL_PRIMARY') || 'gpt-5-nano';
    const fallback =
      config.get<string>('OPENAI_MODEL_FALLBACK') || 'gpt-5-mini';
    logger.log(`LLM provider: openai (${primary} -> ${fallback})`);
    return new OpenAIProvider(
      openAiKey,
      primary,
      fallback,
      config.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      Number(config.get<string>('OPENAI_TIMEOUT_MS') || 30_000),
    );
  }

  if (llmProvider === 'openai' && !openAiKey) {
    logger.warn(
      'LLM_PROVIDER=openai mais OPENAI_API_KEY est vide. Fallback vers Ollama.',
    );
  }
  const model = config.get<string>('OLLAMA_MODEL') || 'llama3.1:latest';
  logger.log(`LLM provider: ollama (${model})`);
  return new OllamaProvider(
    config.get<string>('OLLAMA_URL') || 'http://localhost:11434',
    model,
  );
}
