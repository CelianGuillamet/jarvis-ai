import { LLMMessage, LLMProvider } from './llm.provider';

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
};

type OpenAIResponsesResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

class OpenAIRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
  }
}

export class OpenAIProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly primaryModel = process.env.OPENAI_MODEL_PRIMARY ||
      'gpt-5-nano',
    private readonly fallbackModel = process.env.OPENAI_MODEL_FALLBACK ||
      'gpt-5-mini',
    private readonly baseUrl = process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1',
    private readonly timeoutMs = Number(
      process.env.OPENAI_TIMEOUT_MS || 30_000,
    ),
  ) {}

  async chat(messages: LLMMessage[]): Promise<string> {
    const tried: string[] = [];
    let firstError: unknown = null;

    try {
      tried.push(this.primaryModel);
      const out = await this.chatWithModel(this.primaryModel, messages);
      if (out.trim()) return out;
      throw new Error(`Réponse vide sur ${this.primaryModel}`);
    } catch (error) {
      firstError = error;
    }

    if (
      this.fallbackModel &&
      this.fallbackModel.trim() &&
      this.fallbackModel !== this.primaryModel
    ) {
      try {
        tried.push(this.fallbackModel);
        const out = await this.chatWithModel(this.fallbackModel, messages);
        if (out.trim()) return out;
        throw new Error(`Réponse vide sur ${this.fallbackModel}`);
      } catch (fallbackError) {
        const firstMsg =
          firstError instanceof Error ? firstError.message : String(firstError);
        const fallbackMsg =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `OpenAI échec (${tried.join(' -> ')}). primary="${firstMsg}" fallback="${fallbackMsg}"`,
        );
      }
    }

    throw firstError instanceof Error
      ? firstError
      : new Error(`OpenAI échec (${tried.join(' -> ')})`);
  }

  private async chatWithModel(
    model: string,
    messages: LLMMessage[],
  ): Promise<string> {
    try {
      const out = await this.chatWithCompletions(model, messages);
      if (out.trim()) return out;
    } catch (error) {
      if (
        !(error instanceof OpenAIRequestError) ||
        ![400, 404, 415, 422].includes(error.status)
      ) {
        throw error;
      }
      // fallback on /responses for models/configs incompatible with chat/completions
      const out = await this.chatWithResponses(model, messages);
      if (out.trim()) return out;
      throw error;
    }

    return this.chatWithResponses(model, messages);
  }

  private async chatWithCompletions(
    model: string,
    messages: LLMMessage[],
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new OpenAIRequestError(
          res.status,
          body,
          `OpenAI error (${model}): ${res.status} ${body}`,
        );
      }

      const data = (await res.json()) as OpenAIChatCompletionResponse;
      const content = this.extractContent(data);
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  private async chatWithResponses(
    model: string,
    messages: LLMMessage[],
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new OpenAIRequestError(
          res.status,
          body,
          `OpenAI responses error (${model}): ${res.status} ${body}`,
        );
      }

      const data = (await res.json()) as OpenAIResponsesResponse;
      return this.extractResponsesContent(data);
    } finally {
      clearTimeout(timer);
    }
  }

  private extractContent(data: OpenAIChatCompletionResponse) {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
      return content
        .filter(
          (chunk) => chunk?.type === 'text' && typeof chunk.text === 'string',
        )
        .map((chunk) => chunk.text ?? '')
        .join('');
    }

    return '';
  }

  private extractResponsesContent(data: OpenAIResponsesResponse) {
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
      return data.output_text;
    }

    const chunks = data.output ?? [];
    const texts: string[] = [];
    for (const block of chunks) {
      const content = block?.content ?? [];
      for (const part of content) {
        if (
          (part?.type === 'output_text' || part?.type === 'text') &&
          typeof part.text === 'string' &&
          part.text.trim()
        ) {
          texts.push(part.text);
        }
      }
    }
    return texts.join('');
  }
}
