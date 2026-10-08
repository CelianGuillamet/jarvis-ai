import {
  BudgetedLlmProvider,
  ModelBudget,
  ModelBudgetExceededError,
  withModelOwner,
} from './model-budget';
import { ModelDeadlineError } from './model-limits';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';

const limits = { userDailyCalls: 2, globalDailyCalls: 3, trackedOwners: 2 };
const inner = () => ({ chat: jest.fn().mockResolvedValue('ok') });

describe('ModelBudget', () => {
  it('refuses a user past the daily quota without calling the model', async () => {
    const model = inner();
    const provider = new BudgetedLlmProvider(model, new ModelBudget(limits));
    await withModelOwner('a', async () => {
      await provider.chat([]);
      await provider.chat([]);
      await expect(provider.chat([])).rejects.toBeInstanceOf(
        ModelBudgetExceededError,
      );
    });
    expect(model.chat).toHaveBeenCalledTimes(2);
    await withModelOwner('b', () => provider.chat([]));
  });

  it('enforces the global ceiling and the tracked-owner cap', async () => {
    const budget = new ModelBudget(limits);
    const provider = new BudgetedLlmProvider(inner(), budget);
    await withModelOwner('a', () => provider.chat([]));
    await withModelOwner('b', () => provider.chat([]));
    await expect(
      withModelOwner('c', () => provider.chat([])),
    ).rejects.toMatchObject({ status: 429 });
    await withModelOwner('a', () => provider.chat([]));
    await expect(
      withModelOwner('a', () => provider.chat([])),
    ).rejects.toBeInstanceOf(ModelBudgetExceededError);
    expect(budget.snapshot().rejectedGlobal).toBe(2);
  });

  it('resets counters on a new UTC day and reports Retry-After', () => {
    let now = Date.UTC(2026, 9, 8, 23, 0, 0);
    const budget = new ModelBudget({ ...limits, userDailyCalls: 1 }, () => now);
    budget.reserve('a');
    try {
      budget.reserve('a');
    } catch (error) {
      const body = (error as ModelBudgetExceededError).getResponse() as {
        retryAfterSeconds: number;
      };
      expect(body.retryAfterSeconds).toBe(3600);
    }
    now = Date.UTC(2026, 9, 9, 0, 0, 1);
    expect(() => budget.reserve('a')).not.toThrow();
  });

  it('records failures, latency and calls per successful workflow', async () => {
    const budget = new ModelBudget(limits);
    ModelBudget.shared = budget;
    const failing = {
      chat: jest
        .fn()
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValue('ok'),
    };
    const provider = new BudgetedLlmProvider(failing, budget);
    await withModelOwner('a', async () => {
      await expect(provider.chat([])).rejects.toThrow('x');
      await provider.chat([]);
    });
    ModelBudget.shared = null;
    const snapshot = budget.snapshot();
    expect(snapshot).toMatchObject({
      calls: 2,
      failures: 1,
      workflows: 1,
      callsPerSuccessfulWorkflow: 2,
    });
  });
});

describe('model deadline and output budget', () => {
  afterEach(() => jest.restoreAllMocks());
  const ok = () =>
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'hi' } }],
      }),
    );

  it('sends the output cap to OpenAI', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    await new OpenAIProvider('k', 'p', 'f', 'http://x', 1000, {
      totalDeadlineMs: 5000,
      maxOutputTokens: 123,
    }).chat([]);
    const sent = JSON.parse(fetch.mock.calls[0][1]?.body as string) as {
      max_completion_tokens: number;
    };
    expect(sent.max_completion_tokens).toBe(123);
  });

  it('stops before a fallback once the total deadline is spent', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return new Response('', { status: 500 });
      });
    await expect(
      new OpenAIProvider('k', 'p', 'f', 'http://x', 1000, {
        totalDeadlineMs: 10,
        maxOutputTokens: 10,
      }).chat([]),
    ).rejects.toBeInstanceOf(ModelDeadlineError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caps Ollama output and aborts on the deadline', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ done: true, message: { content: 'hi' } }),
        ),
      );
    await new OllamaProvider('http://x', 'm', {
      totalDeadlineMs: 5000,
      maxOutputTokens: 77,
    }).chat([]);
    const init = fetch.mock.calls[0][1];
    const sent = JSON.parse(init?.body as string) as {
      options: { num_predict: number };
    };
    expect(sent.options.num_predict).toBe(77);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
