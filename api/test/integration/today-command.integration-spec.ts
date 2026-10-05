import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { CommandExecutionService } from '../../src/commands/command-execution.service';
import { TodayCommandService } from '../../src/today/today-command.service';
import type { ToolOnly } from '../../src/jarvis/tools/tool-registry';

describe('Durable direct Today commands', () => {
  const prisma = new PrismaService();
  const ownerId = 'today-command-owner';
  let conversationId: string;
  const service = () =>
    new TodayCommandService(prisma, new CommandExecutionService(prisma));
  const input = (requestId = randomUUID(), simulation = false) => ({
    ownerId,
    conversationId,
    requestId,
    call: {
      type: 'tool',
      name: 'todo.add',
      args: { text: 'Exact task' },
    } as ToolOnly,
    policy: {
      ownerId,
      simulation,
      capabilities: ['todo.add'] as const,
      loadGoogleStatus: jest.fn(),
    },
  });
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: ownerId,
        name: 'Today',
        email: 'today-command@example.invalid',
      },
    });
    conversationId = await new ConversationService(prisma).resolve(
      ownerId,
      'today',
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('replays a persisted outcome across service restart without preparing or writing twice', async () => {
    const request = input();
    const prepare = jest.fn().mockResolvedValue([]);
    const mutate = jest.fn(async () => {
      await prisma.todo.create({ data: { ownerId, text: request.requestId } });
      return 'Created';
    });
    const result = await service().execute(
      request,
      prepare,
      mutate,
      () => 'Simulated',
    );
    expect(
      await service().execute(request, prepare, mutate, () => 'Simulated'),
    ).toEqual(result);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(
      await prisma.todo.count({ where: { ownerId, text: request.requestId } }),
    ).toBe(1);
    expect(request.policy.loadGoogleStatus).not.toHaveBeenCalled();
  });

  it('allows only one effect for concurrent duplicate submissions', async () => {
    const request = input();
    const mutate = jest.fn(async () => {
      await prisma.todo.create({ data: { ownerId, text: request.requestId } });
      return 'Created once';
    });
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        service().execute(
          request,
          () => Promise.resolve([]),
          mutate,
          () => 'Simulated',
        ),
      ),
    );
    expect(new Set(results.map((row) => row.commandId)).size).toBe(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(
      await prisma.todo.count({ where: { ownerId, text: request.requestId } }),
    ).toBe(1);
  });

  it('refuses changed intent for an existing request identity', async () => {
    const request = input();
    await service().execute(
      request,
      () => Promise.resolve([]),
      () => Promise.resolve('Created'),
      () => 'Simulated',
    );
    await expect(
      service().execute(
        {
          ...request,
          call: { type: 'tool', name: 'todo.add', args: { text: 'Changed' } },
        },
        () => Promise.resolve([]),
        () => Promise.resolve('Duplicate'),
        () => 'Simulated',
      ),
    ).rejects.toThrow('autre action');
  });

  it('never repeats an effect after a failure with an uncertain result', async () => {
    const request = input();
    const mutate = jest.fn(async () => {
      await prisma.todo.create({ data: { ownerId, text: request.requestId } });
      throw new Error('Response unavailable after effect');
    });
    await expect(
      service().execute(
        request,
        () => Promise.resolve([]),
        mutate,
        () => 'Simulated',
      ),
    ).rejects.toThrow();
    expect(
      await service().execute(
        request,
        () => Promise.resolve([]),
        mutate,
        () => 'Simulated',
      ),
    ).toMatchObject({ state: 'unknown' });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(
      await prisma.todo.count({ where: { ownerId, text: request.requestId } }),
    ).toBe(1);
  });

  it('persists and replays simulation without entering the mutation callback', async () => {
    const request = input(randomUUID(), true);
    const mutate = jest.fn().mockResolvedValue('Unexpected mutation');
    const result = await service().execute(
      request,
      () => Promise.resolve([]),
      mutate,
      () => 'Simulated',
    );
    expect(result).toMatchObject({
      state: 'completed',
      simulation: true,
      text: 'Simulated',
    });
    expect(
      await service().execute(
        request,
        () => Promise.resolve([]),
        mutate,
        () => 'Different simulation',
      ),
    ).toEqual(result);
    expect(mutate).not.toHaveBeenCalled();
  });
});
