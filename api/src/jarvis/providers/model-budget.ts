import { HttpException, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LLMMessage, LLMProvider } from './llm.provider';

export type ModelBudgetLimits = {
  userDailyCalls: number;
  globalDailyCalls: number;
  trackedOwners: number;
};

export type ModelUsageSnapshot = {
  calls: number;
  failures: number;
  rejectedUser: number;
  rejectedGlobal: number;
  averageLatencyMs: number;
  workflows: number;
  callsPerSuccessfulWorkflow: number | null;
};

export class ModelBudgetExceededError extends HttpException {
  constructor(scope: 'user' | 'global', retryAfterSeconds: number) {
    super(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message:
          scope === 'user'
            ? 'Tu as atteint ta limite quotidienne de requêtes à l’assistant. Réessaie demain.'
            : 'L’assistant a atteint sa limite quotidienne de la bêta. Réessaie demain.',
        retryAfterSeconds,
      },
      429,
    );
  }
}

const ownerContext = new AsyncLocalStorage<{
  ownerId: string;
  workflowCalls: { count: number };
}>();

export function withModelOwner<T>(
  ownerId: string,
  work: () => Promise<T>,
): Promise<T> {
  const state = { ownerId, workflowCalls: { count: 0 } };
  return ownerContext.run(state, async () => {
    const result = await work();
    ModelBudget.shared?.completeWorkflow(state.workflowCalls.count);
    return result;
  });
}

/**
 * Fixed UTC-day counters in memory. They reset on restart and are not shared
 * between instances, so they bound a single local process, not billing.
 */
export class ModelBudget {
  static shared: ModelBudget | null = null;

  private day = '';
  private readonly perOwner = new Map<string, number>();
  private globalCalls = 0;
  private calls = 0;
  private failures = 0;
  private rejectedUser = 0;
  private rejectedGlobal = 0;
  private latencyMs = 0;
  private workflows = 0;
  private workflowCallTotal = 0;

  constructor(
    private readonly limits: ModelBudgetLimits,
    private readonly now: () => number = Date.now,
  ) {}

  reserve(ownerId: string | undefined): void {
    this.rollDay();
    const retry = this.secondsUntilReset();
    if (this.globalCalls >= this.limits.globalDailyCalls) {
      this.rejectedGlobal += 1;
      throw new ModelBudgetExceededError('global', retry);
    }
    if (ownerId) {
      const used = this.perOwner.get(ownerId) ?? 0;
      if (used >= this.limits.userDailyCalls) {
        this.rejectedUser += 1;
        throw new ModelBudgetExceededError('user', retry);
      }
      if (
        !this.perOwner.has(ownerId) &&
        this.perOwner.size >= this.limits.trackedOwners
      ) {
        this.rejectedGlobal += 1;
        throw new ModelBudgetExceededError('global', retry);
      }
      this.perOwner.set(ownerId, used + 1);
    }
    this.globalCalls += 1;
  }

  record(latencyMs: number, ok: boolean): void {
    this.calls += 1;
    this.latencyMs += latencyMs;
    if (!ok) this.failures += 1;
  }

  completeWorkflow(calls: number): void {
    if (calls < 1) return;
    this.workflows += 1;
    this.workflowCallTotal += calls;
  }

  snapshot(): ModelUsageSnapshot {
    return {
      calls: this.calls,
      failures: this.failures,
      rejectedUser: this.rejectedUser,
      rejectedGlobal: this.rejectedGlobal,
      averageLatencyMs: this.calls ? this.latencyMs / this.calls : 0,
      workflows: this.workflows,
      callsPerSuccessfulWorkflow: this.workflows
        ? this.workflowCallTotal / this.workflows
        : null,
    };
  }

  private dayKey() {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private rollDay() {
    const key = this.dayKey();
    if (key === this.day) return;
    this.day = key;
    this.perOwner.clear();
    this.globalCalls = 0;
  }

  private secondsUntilReset() {
    const next = new Date(this.now());
    next.setUTCHours(24, 0, 0, 0);
    return Math.max(1, Math.ceil((next.getTime() - this.now()) / 1000));
  }
}

export class BudgetedLlmProvider implements LLMProvider {
  private readonly logger = new Logger('ModelBudget');

  constructor(
    private readonly inner: LLMProvider,
    private readonly budget: ModelBudget,
  ) {}

  get providerName() {
    return this.inner.providerName;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const context = ownerContext.getStore();
    try {
      this.budget.reserve(context?.ownerId);
    } catch (error) {
      if (error instanceof ModelBudgetExceededError)
        this.logger.warn('Model budget refused a call');
      throw error;
    }
    if (context) context.workflowCalls.count += 1;
    const started = Date.now();
    try {
      const out = await this.inner.chat(messages);
      this.budget.record(Date.now() - started, true);
      return out;
    } catch (error) {
      this.budget.record(Date.now() - started, false);
      throw error;
    }
  }
}
