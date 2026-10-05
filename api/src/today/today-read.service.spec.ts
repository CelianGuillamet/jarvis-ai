import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TodayMutationSchema } from '../contracts/v1';
import { TodayReadService } from './today-read.service';

describe('Today owner reads', () => {
  function fixture(tasks: unknown[] = [], notes: unknown[] = []) {
    const todo = { findMany: jest.fn().mockReturnValue('tasks') };
    const note = { findMany: jest.fn().mockReturnValue('notes') };
    const transaction = jest.fn().mockResolvedValue([tasks, notes]);
    const service = new TodayReadService({
      todo,
      note,
      $transaction: transaction,
    } as unknown as PrismaService);
    return { service, todo, note, transaction };
  }
  it('scopes bounded reads and returns genuine empty lists', async () => {
    const { service, todo, note } = fixture();
    expect(await service.snapshot('owner')).toMatchObject({
      tasks: [],
      notes: [],
      tasksHasMore: false,
      notesHasMore: false,
    });
    expect(todo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner' },
        take: 51,
      }),
    );
    expect(note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner' },
        take: 51,
      }),
    );
  });
  it('bounds results with explicit continuation metadata', async () => {
    const createdAt = new Date();
    const tasks = Array.from({ length: 51 }, () => ({
      id: randomUUID(),
      text: 'Task',
      done: false,
      doneAt: null,
      createdAt,
    }));
    const { service } = fixture(tasks);
    const result = await service.snapshot('owner');
    expect(result.tasks).toHaveLength(50);
    expect(result.tasksHasMore).toBe(true);
    expect(result.tasks[0].createdAt).toBe(createdAt.toISOString());
  });
  it('reports storage failure rather than an empty account', async () => {
    const { service, transaction } = fixture();
    transaction.mockRejectedValue(new Error('secret connection'));
    await expect(service.snapshot('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.snapshot('owner')).rejects.not.toThrow(
      'secret connection',
    );
  });
  it('rejects malformed stored rows', async () => {
    const { service } = fixture([{ id: 'invalid' }]);
    await expect(service.snapshot('owner')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('requires exact IDs, bounded text and no caller-supplied owner', () => {
    expect(
      TodayMutationSchema.safeParse({
        operation: 'task.edit',
        id: 'title',
        text: 'New',
      }).success,
    ).toBe(false);
    expect(
      TodayMutationSchema.safeParse({ operation: 'task.create', text: '  ' })
        .success,
    ).toBe(false);
    expect(
      TodayMutationSchema.safeParse({
        operation: 'task.create',
        text: 'New',
        ownerId: 'other',
      }).success,
    ).toBe(false);
    expect(
      TodayMutationSchema.safeParse({
        operation: 'note.edit',
        id: randomUUID(),
        title: null,
        text: 'Body',
      }).success,
    ).toBe(true);
  });
});
