import {
  ChatCompletionResponseSchema,
  ResponsesResponseSchema,
  InvalidModelResponseError,
  readModelResponse,
} from './model-response';
import { LLMMessage, LLMProvider } from './llm.provider';
import {
  DEFAULT_MODEL_LIMITS,
  ModelDeadlineError,
  type ModelLimits,
} from './model-limits';

class OpenAIRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class OpenAIProvider implements LLMProvider {
  readonly providerName = 'openai';

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
    private readonly limits: ModelLimits = DEFAULT_MODEL_LIMITS,
  ) {}

  async chat(messages: LLMMessage[]): Promise<string> {
    const deadline = Date.now() + this.limits.totalDeadlineMs;
    const tried: string[] = [];
    let firstError: unknown = null;

    try {
      tried.push(this.primaryModel);
      const out = await this.chatWithModel(
        this.primaryModel,
        messages,
        deadline,
      );
      if (out.trim()) return out;
      throw new Error(`Réponse vide sur ${this.primaryModel}`);
    } catch (error) {
      if (
        error instanceof InvalidModelResponseError ||
        error instanceof ModelDeadlineError
      )
        throw error;
      firstError = error;
    }

    if (
      this.fallbackModel &&
      this.fallbackModel.trim() &&
      this.fallbackModel !== this.primaryModel
    ) {
      try {
        tried.push(this.fallbackModel);
        const out = await this.chatWithModel(
          this.fallbackModel,
          messages,
          deadline,
        );
        if (out.trim()) return out;
        throw new Error(`Réponse vide sur ${this.fallbackModel}`);
      } catch (fallbackError) {
        if (
          fallbackError instanceof InvalidModelResponseError ||
          fallbackError instanceof ModelDeadlineError
        )
          throw fallbackError;
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
    deadline: number,
  ): Promise<string> {
    try {
      const out = await this.chatWithCompletions(model, messages, deadline);
      if (out.trim()) return out;
    } catch (error) {
      if (
        !(error instanceof OpenAIRequestError) ||
        ![400, 404, 415, 422].includes(error.status)
      ) {
        throw error;
      }
      // fallback on /responses for models/configs incompatible with chat/completions
      const out = await this.chatWithResponses(model, messages, deadline);
      if (out.trim()) return out;
      throw error;
    }

    return this.chatWithResponses(model, messages, deadline);
  }

  private async chatWithCompletions(
    model: string,
    messages: LLMMessage[],
    deadline: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.requestBudgetMs(deadline),
    );

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
          max_completion_tokens: this.limits.maxOutputTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new OpenAIRequestError(
          res.status,
          `OpenAI error (${model}): ${res.status}`,
        );
      }

      const data = await readModelResponse(res, ChatCompletionResponseSchema);
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }

  private async chatWithResponses(
    model: string,
    messages: LLMMessage[],
    deadline: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.requestBudgetMs(deadline),
    );

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
          max_output_tokens: this.limits.maxOutputTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new OpenAIRequestError(
          res.status,
          `OpenAI responses error (${model}): ${res.status}`,
        );
      }

      return await readModelResponse(res, ResponsesResponseSchema);
    } finally {
      clearTimeout(timer);
    }
  }

  private requestBudgetMs(deadline: number) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ModelDeadlineError();
    return Math.min(this.timeoutMs, remaining);
  }
}
