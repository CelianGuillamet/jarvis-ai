import { OllamaResponseSchema, readModelResponse } from './model-response';
import { LLMMessage, LLMProvider } from './llm.provider';

export class OllamaProvider implements LLMProvider {
  readonly providerName = 'ollama';

  constructor(
    private readonly baseUrl = process.env.OLLAMA_URL ||
      'http://localhost:11434',
    private readonly model = process.env.OLLAMA_MODEL || 'llama3.1:latest',
  ) {}

  async chat(messages: LLMMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    // si Ollama renvoie une erreur, on la remonte clairement
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

    const data = await readModelResponse(res, OllamaResponseSchema);
    return data.message.content;
  }
}
