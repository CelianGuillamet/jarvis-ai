import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TodayTargetService } from './today-target.service';

describe('Exact Today targets', () => {
  function fixture() {
    const todo = { findFirst: jest.fn().mockResolvedValue(null) };
    const note = { findFirst: jest.fn().mockResolvedValue(null) };
    return {
      todo,
      note,
      service: new TodayTargetService({
        todo,
        note,
      } as unknown as PrismaService),
    };
  }
  it('freezes the exact owned task values for transactional stale-target checks', async () => {
    const { service, todo } = fixture();
    const row = { id: 'selected', text: 'Same title', done: false };
    todo.findFirst.mockResolvedValue(row);
    expect(
      await service.resolve('owner', {
        operation: 'task.complete',
        id: row.id,
      }),
    ).toEqual({ kind: 'todo', items: [row] });
    expect(todo.findFirst).toHaveBeenCalledWith({
      where: { ownerId: 'owner', id: 'selected' },
      select: { id: true, text: true, done: true },
    });
  });
  it('does not fall back to a similarly named task for a missing or foreign ID', async () => {
    const { service, todo, note } = fixture();
    await expect(
      service.resolve('owner', {
        operation: 'task.edit',
        id: 'foreign',
        text: 'New',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(todo.findFirst).toHaveBeenCalledTimes(1);
    expect(note.findFirst).not.toHaveBeenCalled();
  });
  it('freezes note title and body without consulting task aliases', async () => {
    const { service, todo, note } = fixture();
    const row = { id: 'note', title: null, text: 'Body' };
    note.findFirst.mockResolvedValue(row);
    expect(
      await service.resolve('owner', {
        operation: 'note.edit',
        id: 'note',
        title: 'New',
        text: 'New body',
      }),
    ).toEqual({ kind: 'note', items: [row] });
    expect(note.findFirst).toHaveBeenCalledWith({
      where: { ownerId: 'owner', id: 'note' },
      select: { id: true, title: true, text: true },
    });
    expect(todo.findFirst).not.toHaveBeenCalled();
  });
  it('preserves an unavailable outcome when exact resolution fails', async () => {
    const { service, todo } = fixture();
    todo.findFirst.mockRejectedValue(new Error('private database details'));
    await expect(
      service.resolve('owner', { operation: 'task.complete', id: 'id' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('creates without resolving an unrelated target', async () => {
    const { service, todo, note } = fixture();
    expect(
      await service.resolve('owner', {
        operation: 'task.create',
        text: 'Task',
      }),
    ).toBeUndefined();
    expect(todo.findFirst).not.toHaveBeenCalled();
    expect(note.findFirst).not.toHaveBeenCalled();
  });
});
