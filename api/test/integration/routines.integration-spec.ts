import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GOOGLE_AUTH_SCOPES } from '../../src/google/google-scopes';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { CommandExecutionService } from '../../src/commands/command-execution.service';
import { TodayCommandService } from '../../src/today/today-command.service';
import { RoutineService } from '../../src/routines/routine.service';
import type {
  RoutineStepOutcome,
  RoutineStepRunner,
} from '../../src/routines/routine-step-runner';
import type { ToolOnly } from '../../src/jarvis/tools/tool-registry';

describe('Routines on PostgreSQL', () => {
  const prisma = new PrismaService();
  const owners = ['routine-owner-a', 'routine-owner-b'];
  const conversations: Record<string, string> = {};
  const effects: string[] = [];
  let behaviour: (tool: string, attempt: number) => Promise<string> | string;

  /** Same journaled claim path as JarvisService.runRoutineStep, with a fake tool body. */
  const runner: RoutineStepRunner = {
    async runRoutineStep(input): Promise<RoutineStepOutcome> {
      const today = new TodayCommandService(
        prisma,
        new CommandExecutionService(prisma),
      );
      const attempt = Number(input.requestId.split(':').at(-1));
      const result = await today.execute(
        {
          ownerId: input.ownerId,
          conversationId: input.conversationId,
          requestId: input.requestId,
          call: input.call,
          policy: {
            ownerId: input.ownerId,
            simulation: false,
            capabilities: [input.call.name],
            loadGoogleStatus: () =>
              Promise.resolve({
                scopes: [...GOOGLE_AUTH_SCOPES],
                connected: true,
                calendarConnected: true,
                gmailConnected: false,
              }),
          },
        },
        () => Promise.resolve([]),
        async () => {
          effects.push(`${input.call.name}:${attempt}`);
          return behaviour(input.call.name, attempt);
        },
        () => 'sim',
      );
      return {
        state: result.state,
        commandId: result.commandId,
        text: result.text,
      };
    },
  };
  /** Lease 0 models a restarted process; the default models a live concurrent caller. */
  const service = (r: RoutineStepRunner = runner, leaseMs = 0) =>
    new RoutineService(prisma, r, leaseMs);
  const live = () => new RoutineService(prisma, runner);

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of owners) {
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.invalid` },
      });
      conversations[id] = await new ConversationService(prisma).resolve(
        id,
        'routines',
      );
    }
  });
  beforeEach(() => {
    effects.length = 0;
    behaviour = (tool) => `result of ${tool}`;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const [a, b] = owners;
  const start = (owner = a, requestId = randomUUID()) =>
    service().start(owner, conversations[owner], 'prepare-day', requestId);

  it('runs every step once, records journal commands and composes a result', async () => {
    const run = await start();
    expect(run.state).toBe('completed');
    expect(run.steps.map((s) => s.state)).toEqual(['completed', 'completed']);
    expect(run.result).toContain('Agenda du jour');
    expect(run.result).toContain('result of todo.list');
    expect(effects).toEqual(['calendar.list:1', 'todo.list:1']);
    const commands = await prisma.command.findMany({
      where: { ownerId: a, id: { in: run.steps.map((s) => s.commandId!) } },
    });
    expect(commands).toHaveLength(2);
    expect(commands.every((c) => c.state === 'completed')).toBe(true);
  });

  it('replays a duplicate start without repeating any step', async () => {
    const requestId = randomUUID();
    const first = await start(a, requestId);
    const second = await start(a, requestId);
    expect(second).toEqual(first);
    expect(effects).toHaveLength(2);
    await expect(
      service().start(a, conversations[a], 'prepare-day', requestId),
    ).resolves.toMatchObject({ id: first.id });
  });

  it('serializes concurrent advances into a single effect per step', async () => {
    const requestId = randomUUID();
    const begin = () =>
      live().start(a, conversations[a], 'prepare-day', requestId);
    const results = await Promise.allSettled([begin(), begin(), begin()]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const settled = await begin();
    expect(settled.state).toBe('completed');
    expect(effects.filter((e) => e.startsWith('calendar.list'))).toHaveLength(
      1,
    );
    expect(effects.filter((e) => e.startsWith('todo.list'))).toHaveLength(1);
  });

  it('resumes after a crash between steps without repeating a completed step', async () => {
    const requestId = randomUUID();
    let crash = true;
    const crashing: RoutineStepRunner = {
      runRoutineStep: (input) => {
        if (crash && input.call.name === 'todo.list')
          return Promise.reject(new Error('process killed'));
        return runner.runRoutineStep(input);
      },
    };
    await expect(
      service(crashing).start(a, conversations[a], 'prepare-day', requestId),
    ).rejects.toThrow('process killed');
    const stored = await prisma.routineRun.findFirstOrThrow({
      where: { ownerId: a, requestId },
    });
    expect((stored.steps as { state: string }[]).map((s) => s.state)).toEqual([
      'completed',
      'executing',
    ]);
    crash = false;
    const recovered = await start(a, requestId);
    expect(recovered.state).toBe('completed');
    expect(effects).toEqual(['calendar.list:1', 'todo.list:1']);
  });

  it('suspends on a claimed-but-unfinished step and never replays it silently', async () => {
    const requestId = randomUUID();
    let hang = true;
    behaviour = (tool) => {
      if (hang && tool === 'todo.list') throw new Error('storage lost');
      return `result of ${tool}`;
    };
    await expect(start(a, requestId)).rejects.toThrow();
    const afterCrash = await start(a, requestId);
    expect(afterCrash.state).toBe('suspended');
    expect(afterCrash.steps[1].state).toBe('unknown');
    const todoEffects = effects.filter((e) => e.startsWith('todo.list'));
    expect(todoEffects).toEqual(['todo.list:1']);
    hang = false;
    await expect(service().advance(a, afterCrash.id)).resolves.toMatchObject({
      state: 'suspended',
    });
    expect(effects.filter((e) => e.startsWith('todo.list'))).toEqual([
      'todo.list:1',
    ]);

    await expect(
      service().resume(a, afterCrash.id, {
        stepId: 'agenda',
        resolution: 'retry',
        evidence: 'not unknown',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const resumed = await service().resume(a, afterCrash.id, {
      stepId: 'tasks',
      resolution: 'retry',
      evidence: 'Vérifié : lecture seule, aucune donnée modifiée',
    });
    expect(resumed.state).toBe('completed');
    expect(resumed.steps[1]).toMatchObject({
      state: 'completed',
      attempt: 2,
    });
    expect(resumed.steps[1].evidence).toContain('Vérifié');
    expect(effects.filter((e) => e.startsWith('todo.list'))).toEqual([
      'todo.list:1',
      'todo.list:2',
    ]);
  });

  it('skips an unknown step with recorded evidence and finishes the run', async () => {
    behaviour = (tool) => {
      if (tool === 'calendar.list') throw new Error('lost');
      return 'ok';
    };
    const requestId = randomUUID();
    await expect(start(a, requestId)).rejects.toThrow();
    const suspended = await start(a, requestId);
    expect(suspended.steps.map((s) => s.state)).toEqual(['unknown', 'blocked']);
    const done = await service().resume(a, suspended.id, {
      stepId: 'agenda',
      resolution: 'skip',
      evidence: 'Agenda Google indisponible, ignoré',
    });
    expect(done.steps.map((s) => s.state)).toEqual(['skipped', 'completed']);
    expect(done.state).toBe('completed');
  });

  it('skips an optional failed step but fails the run on a required failure', async () => {
    const optionalFailure: RoutineStepRunner = {
      runRoutineStep: async (input) =>
        input.call.name === 'calendar.list'
          ? { state: 'failed', text: 'Google non connecté' }
          : runner.runRoutineStep(input),
    };
    const ok = await service(optionalFailure).start(
      a,
      conversations[a],
      'prepare-day',
      randomUUID(),
    );
    expect(ok.state).toBe('completed');
    expect(ok.steps[0].state).toBe('skipped');
    const requiredFailure: RoutineStepRunner = {
      runRoutineStep: async (input) =>
        input.call.name === 'todo.list'
          ? { state: 'failed', text: 'boom' }
          : runner.runRoutineStep(input),
    };
    const failed = await service(requiredFailure).start(
      a,
      conversations[a],
      'prepare-day',
      randomUUID(),
    );
    expect(failed.state).toBe('failed');
    expect(failed.result).toBeNull();
  });

  it('cancels uncommitted steps and describes what already ran', async () => {
    const requestId = randomUUID();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    behaviour = async (tool) => {
      if (tool === 'calendar.list') await gate;
      return 'ok';
    };
    const running = live().start(a, conversations[a], 'prepare-day', requestId);
    await new Promise((r) => setTimeout(r, 200));
    const row = await prisma.routineRun.findFirstOrThrow({
      where: { ownerId: a, requestId },
    });
    const pending = await live().cancel(a, row.id);
    expect(pending.cancelRequested).toBe(true);
    expect(pending.state).toBe('running');
    release();
    const final = await running;
    const reloaded = await service().advance(a, row.id);
    expect(reloaded.state).toBe('cancelled');
    expect(reloaded.steps.map((s) => s.state)).toEqual([
      'completed',
      'cancelled',
    ]);
    expect(reloaded.result).toContain('1 étape(s) terminée(s)');
    expect(effects).toEqual(['calendar.list:1']);
    expect(final.id).toBe(row.id);
  });

  it('refuses a disabled routine and honours re-enabling', async () => {
    const owner = b;
    await service().setEnabled(owner, 'prepare-day', false);
    await expect(start(owner)).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await service().list(owner)).routines.find(
        (r) => r.key === 'prepare-day',
      )?.enabled,
    ).toBe(false);
    await service().setEnabled(owner, 'prepare-day', true);
    await expect(start(owner)).resolves.toMatchObject({ state: 'completed' });
  });

  it('isolates runs, listing, cancellation and resume between owners', async () => {
    const run = await start(a);
    await expect(service().cancel(b, run.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service().advance(b, run.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await service().list(b)).runs.some((r) => r.id === run.id)).toBe(
      false,
    );
    await expect(
      service().start(b, conversations[b], 'prepare-day', 'x'.repeat(5)),
    ).resolves.toBeDefined();
    const sameRequest = randomUUID();
    await start(a, sameRequest);
    await expect(start(b, sameRequest)).resolves.toMatchObject({
      state: 'completed',
    });
  });

  it('rejects a conflicting reuse of a request ID and unknown routines', async () => {
    const requestId = randomUUID();
    await start(a, requestId);
    await expect(
      service().start(a, 'another-conversation', 'prepare-day', requestId),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service().start(a, conversations[a], 'unknown', randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps the database constraint on oversized runs', async () => {
    await expect(
      prisma.routineRun.create({
        data: {
          ownerId: a,
          conversationId: conversations[a],
          routineKey: 'prepare-day',
          requestId: randomUUID(),
          state: 'running',
          steps: [],
        },
      }),
    ).rejects.toThrow();
  });
});

export type { ToolOnly };
