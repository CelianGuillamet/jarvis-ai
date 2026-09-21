import { LLMMessage, LLMProvider } from './llm.provider';

export class OllamaProvider implements LLMProvider {
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
    if (!res.ok)
      throw new Error(`Ollama error: ${res.status} ${await res.text()}`);

    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null || !('message' in data)) {
      return '';
    }
    const message = data.message;
    if (
      typeof message !== 'object' ||
      message === null ||
      !('content' in message)
    ) {
      return '';
    }
    if (message.content == null) return '';
    if (typeof message.content !== 'string') {
      throw new Error('Ollama returned non-text message content');
    }
    return message.content;
  }
}
