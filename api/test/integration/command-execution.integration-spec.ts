import { CommandRejectedError } from '../../src/commands/command-rejected.error';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import {
  CommandExecutionService,
  type CommandExecution,
} from '../../src/commands/command-execution.service';
import { PendingActionsService } from '../../src/jarvis/services/pending-action.service';

describe('Shared durable command execution', () => {
  const prisma = new PrismaService();
  const executor = new CommandExecutionService(prisma);
  const pending = new PendingActionsService(prisma, new ConfigService());
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture(name: string): Promise<CommandExecution> {
    const ownerId = `executor-${name}`;
    await prisma.user.create({
      data: { id: ownerId, name, email: `${ownerId}@example.invalid` },
    });
    const conversationId = await new ConversationService(prisma).resolve(
      ownerId,
      'main',
    );
    return {
      ownerId,
      conversationId,
      source: 'chat',
      toolName: 'todo.add',
      arguments: { text: 'Fixture' },
      targets: [],
      policy: {
        ownerId,
        simulation: false,
        capabilities: ['todo.add'],
        loadGoogleStatus: () =>
          Promise.resolve({
            connected: false,
            calendarConnected: false,
            gmailConnected: false,
            scopes: [],
          }),
      },
    };
  }

  it.each(['chat', 'inbox'] as const)(
    'persists %s intent before effects and records the same durable outcome',
    async (source) => {
      const input = { ...(await fixture(source)), source };
      const mutate = jest.fn(async () => {
        const intent = await prisma.command.findFirstOrThrow({
          where: { conversationId: input.conversationId },
        });
        expect(intent).toMatchObject({
          source,
          state: 'executing',
          approvedDigest: intent.digest,
        });
        return 'Action effectuée.';
      });
      await expect(
        executor.execute(input, mutate, () => 'Simulation'),
      ).resolves.toBe('Action effectuée.');
      expect(mutate).toHaveBeenCalledTimes(1);
      const row = await prisma.command.findFirstOrThrow({
        where: { conversationId: input.conversationId },
        include: { transitions: { orderBy: { revision: 'asc' } } },
      });
      expect(row).toMatchObject({
        state: 'completed',
        outcomeCode: 'TOOL_RETURNED',
        response: { result: 'Action effectuée.' },
      });
      expect(row.transitions.map((entry) => entry.toState)).toEqual([
        'proposed',
        'waiting',
        'waiting',
        'executing',
        'completed',
      ]);
      expect(await pending.replayLatest(input.conversationId)).toBeNull();
      await expect(
        prisma.command.update({
          where: { id: row.id },
          data: { source: 'confirmation', revision: { increment: 1 } },
        }),
      ).rejects.toThrow();
    },
  );

  it.each(['partial', 'unknown'] as const)(
    'persists the classified %s outcome instead of completed success',
    async (outcome) => {
      const input = {
        ...(await fixture(`classified-${outcome}`)),
        source: 'inbox' as const,
      };
      const result = { outcome, ok: false };
      const mutate = jest.fn(() => Promise.resolve(result));
      await expect(
        executor.execute(
          input,
          mutate,
          () => result,
          (value) => value.outcome,
        ),
      ).resolves.toEqual(result);
      const row = await prisma.command.findFirstOrThrow({
        where: { conversationId: input.conversationId },
      });
      expect(row).toMatchObject({
        state: outcome === 'unknown' ? 'unknown' : 'completed',
        outcomeCode: outcome.toUpperCase(),
        response: outcome === 'unknown' ? null : { result },
      });
      expect(mutate).toHaveBeenCalledTimes(1);
    },
  );

  it('records an explicit pre-effect rejection as failed rather than unknown', async () => {
    const input = await fixture('rejected-before-effect');
    await expect(
      executor.execute(
        input,
        () => Promise.reject(new CommandRejectedError('Date invalide.')),
        () => '',
      ),
    ).rejects.toBeInstanceOf(CommandRejectedError);
    expect(
      await prisma.command.findFirstOrThrow({
        where: { conversationId: input.conversationId },
      }),
    ).toMatchObject({
      state: 'failed',
      outcomeCode: 'VALIDATION',
      response: null,
    });
  });

  it('records simulation without entering the mutation callback', async () => {
    const input = await fixture('simulation');
    input.policy.simulation = true;
    const mutate = jest.fn(() => Promise.resolve('Mutation'));
    await executor.execute(input, mutate, () => 'Simulation');
    expect(mutate).not.toHaveBeenCalled();
    expect(
      await prisma.command.findFirstOrThrow({
        where: { conversationId: input.conversationId },
      }),
    ).toMatchObject({ state: 'completed', outcomeCode: 'SIMULATED' });
  });

  it('retains an unknown outcome after an effect throws without retrying', async () => {
    const input = await fixture('unknown');
    const mutate = jest.fn(() =>
      Promise.reject(new Error('Provider outcome unavailable')),
    );
    await expect(
      executor.execute(input, mutate, () => 'Simulation'),
    ).rejects.toThrow('Provider outcome unavailable');
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(
      await prisma.command.findFirstOrThrow({
        where: { conversationId: input.conversationId },
      }),
    ).toMatchObject({ state: 'unknown', outcomeCode: 'EXECUTION_UNCERTAIN' });
  });

  it('rejects a mismatched owner and an unowned conversation before any effect', async () => {
    const input = await fixture('owner');
    const other = await fixture('other');
    const mutate = jest.fn(() => Promise.resolve('Mutation'));
    await expect(
      executor.execute(
        { ...input, ownerId: other.ownerId },
        mutate,
        () => 'Simulation',
      ),
    ).rejects.toThrow();
    await expect(
      executor.execute(
        { ...input, conversationId: other.conversationId },
        mutate,
        () => 'Simulation',
      ),
    ).rejects.toThrow();
    expect(mutate).not.toHaveBeenCalled();
    expect(
      await prisma.command.count({ where: { ownerId: input.ownerId } }),
    ).toBe(0);
  });
});
