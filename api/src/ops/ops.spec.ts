import { ServiceUnavailableException } from '@nestjs/common';
import { executeWithPolicy } from '../commands/execution-policy';
import { CommandExecutionService } from '../commands/command-execution.service';
import { CommandRejectedError } from '../commands/command-rejected.error';
import { InboxReplyOperationService } from '../inbox-zero/inbox-reply-operation.service';
import { ModelBudget } from '../jarvis/providers/model-budget';
import { evaluateAlerts, DEFAULT_ALERT_THRESHOLDS } from './alerts';
import { HealthController } from './health.controller';
import { mutationsSuspended } from './mutation-kill-switch';
import { OpsMonitorService } from './ops-monitor.service';
import { opsMetrics } from './ops-metrics';
import { requestIdMiddleware, currentRequestId } from './request-context';
import { ApiExceptionFilter } from '../http/api-exception.filter';
import type { PrismaService } from '../prisma/prisma.service';

const policy = (simulation = false) => ({
  ownerId: 'owner',
  simulation,
  capabilities: ['todo.add'] as never,
  loadGoogleStatus: jest.fn(),
});

describe('mutation kill switch', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    opsMetrics.reset();
  });

  it('reads the environment flag and a file without restart', () => {
    expect(mutationsSuspended({}, () => true)).toBe(false);
    expect(mutationsSuspended({ MUTATIONS_DISABLED: 'true' })).toBe(true);
    const env = { MUTATION_KILL_SWITCH_FILE: '/tmp/stop' };
    expect(mutationsSuspended(env, () => true)).toBe(true);
    expect(mutationsSuspended(env, () => false)).toBe(false);
  });

  it('blocks real execution before the callback but keeps simulation', async () => {
    process.env.MUTATIONS_DISABLED = 'true';
    const mutate = jest.fn().mockResolvedValue('done');
    await expect(
      executeWithPolicy(policy(), mutate, () => 'sim'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mutate).not.toHaveBeenCalled();
    await expect(
      executeWithPolicy(policy(true), mutate, () => 'sim'),
    ).resolves.toBe('sim');
    expect(opsMetrics.killSwitchRefusals).toBe(1);
  });

  it('blocks the inbox reply sender before any state change', async () => {
    process.env.MUTATIONS_DISABLED = 'true';
    const prisma = {} as PrismaService;
    const send = jest.fn();
    await expect(
      new InboxReplyOperationService(prisma).execute(
        {} as never,
        {
          send,
        } as never,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses commands through the shared executor without journal writes', async () => {
    process.env.MUTATIONS_DISABLED = 'true';
    const prisma = { $transaction: jest.fn(), command: {} };
    const executor = new CommandExecutionService(prisma as never);
    const mutate = jest.fn();
    await expect(
      executor.execute(
        {
          ownerId: 'owner',
          conversationId: 'c',
          toolName: 'todo.add',
          arguments: {},
          targets: [],
          policy: policy(),
          source: 'chat',
        },
        mutate,
        () => 'sim',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('failure diagnosis without content', () => {
  afterEach(() => opsMetrics.reset());

  it('counts rejected and uncertain commands and logs only identifiers', async () => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue('cmd-1'),
      command: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cmd-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const executor = new CommandExecutionService(prisma as never);
    const warn = jest
      .spyOn(
        (executor as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation();
    const input = {
      ownerId: 'owner',
      conversationId: 'c',
      toolName: 'todo.add',
      arguments: { text: 'SECRET-BODY' },
      targets: [],
      policy: policy(),
      source: 'chat' as const,
    };
    await expect(
      executor.execute(
        input,
        () => Promise.reject(new CommandRejectedError('SECRET-BODY')),
        () => 'x',
      ),
    ).rejects.toBeInstanceOf(CommandRejectedError);
    await expect(
      executor.execute(
        input,
        () => Promise.reject(new Error('SECRET-BODY')),
        () => 'x',
      ),
    ).rejects.toThrow();
    expect(opsMetrics.snapshot()).toMatchObject({
      commandsFailed: 1,
      commandsUnknown: 1,
    });
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('command=cmd-1');
    expect(logged).toContain('outcome=VALIDATION');
    expect(logged).toContain('outcome=EXECUTION_UNCERTAIN');
    expect(logged).not.toContain('SECRET-BODY');
  });

  it('assigns a fresh request ID and logs 5xx without the error message', () => {
    const headers: Record<string, string> = {};
    const res = { set: (k: string, v: string) => (headers[k] = v) };
    let inside: string | undefined;
    requestIdMiddleware(
      { headers: { 'x-request-id': 'attacker' } } as never,
      res as never,
      () => (inside = currentRequestId()),
    );
    expect(inside).toBe(headers['X-Request-Id']);
    expect(inside).not.toBe('attacker');

    const filter = new ApiExceptionFilter();
    const error = jest
      .spyOn(
        (filter as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation();
    const json = jest.fn();
    const response = { headersSent: false, status: jest.fn(() => ({ json })) };
    filter.catch(new Error('SECRET-BODY'), {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'POST', path: '/api/jarvis/chat' }),
      }),
    } as never);
    expect(String(error.mock.calls[0][0])).toContain('status=500');
    expect(String(error.mock.calls[0][0])).not.toContain('SECRET-BODY');
    expect(opsMetrics.http5xx).toBe(1);
  });
});

describe('alerts with injected failures', () => {
  const none = {
    commandsCompleted: 0,
    commandsFailed: 0,
    commandsUnknown: 0,
    killSwitchRefusals: 0,
    http5xx: 0,
  };
  const model = {
    calls: 0,
    failures: 0,
    rejectedUser: 0,
    rejectedGlobal: 0,
    averageLatencyMs: 0,
    workflows: 0,
    callsPerSuccessfulWorkflow: null,
  };
  const codes = (...args: Parameters<typeof evaluateAlerts>) =>
    evaluateAlerts(...args).map((a) => a.code);

  it('stays quiet when healthy or below the sample minimum', () => {
    expect(codes(none, model, false)).toEqual([]);
    expect(codes({ ...none, commandsFailed: 5 }, model, false)).toEqual([]);
  });

  it('raises each alert at its threshold', () => {
    expect(
      codes({ ...none, commandsCompleted: 7, commandsFailed: 3 }, null, false),
    ).toEqual(['COMMAND_FAILURES']);
    expect(
      codes({ ...none, commandsCompleted: 8, commandsUnknown: 2 }, null, false),
    ).toContain('COMMAND_UNKNOWN_OUTCOMES');
    expect(codes(none, { ...model, calls: 10, failures: 4 }, false)).toEqual([
      'MODEL_FAILURES',
    ]);
    expect(codes(none, { ...model, rejectedUser: 1 }, false)).toEqual([
      'MODEL_BUDGET_REJECTIONS',
    ]);
    expect(
      codes(
        { ...none, http5xx: DEFAULT_ALERT_THRESHOLDS.http5xx },
        null,
        false,
      ),
    ).toEqual(['HTTP_5XX']);
    expect(codes(none, null, true)).toEqual(['MUTATIONS_SUSPENDED']);
  });

  it('monitor reports alerts from live counters and logs once per change', () => {
    opsMetrics.http5xx = 25;
    ModelBudget.shared = null;
    const monitor = new OpsMonitorService();
    const error = jest
      .spyOn(
        (monitor as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation();
    expect(monitor.check().map((a) => a.code)).toEqual(['HTTP_5XX']);
    monitor.check();
    expect(error).toHaveBeenCalledTimes(1);
    opsMetrics.reset();
  });
});

describe('readiness', () => {
  it('reports ready state and fails when the database is down', async () => {
    const up = new HealthController({
      $queryRaw: jest.fn().mockResolvedValue([1]),
    } as never);
    await expect(up.ready()).resolves.toMatchObject({
      status: 'ok',
      database: 'ok',
      mutations: 'enabled',
    });
    const down = new HealthController({
      $queryRaw: jest.fn().mockRejectedValue(new Error('postgres://secret')),
    } as never);
    await expect(down.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(up.live()).toEqual({ status: 'ok' });
  });
});
