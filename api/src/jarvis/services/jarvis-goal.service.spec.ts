import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisGoalService } from './jarvis-goal.service';

describe('Goal mutation outcomes', () => {
  function fixture() {
    const jarvisGoal = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockRejectedValue(new Error('private database details')),
      update: jest
        .fn()
        .mockRejectedValue(new Error('private database details')),
    };
    return {
      jarvisGoal,
      service: new JarvisGoalService({
        jarvisGoal,
      } as unknown as PrismaService),
    };
  }

  it('keeps missing owned parents distinct from storage outages', async () => {
    const { jarvisGoal, service } = fixture();
    expect(
      await service.create('owner', {
        title: 'Child',
        parentGoalId: 'foreign',
      }),
    ).toBeNull();
    expect(jarvisGoal.create).not.toHaveBeenCalled();
    await expect(service.create('owner', { title: 'Root' })).rejects.toThrow(
      ServiceUnavailableException,
    );
    jarvisGoal.findFirst.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      service.create('owner', { title: 'Child', parentGoalId: 'parent' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not report a partial decomposition as a successful list', async () => {
    const { service } = fixture();
    jest.spyOn(service, 'create').mockResolvedValueOnce(null);
    await expect(
      service.decompose('owner', 'parent', [{ title: 'Child' }]),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not swallow a failed child write', async () => {
    const { jarvisGoal, service } = fixture();
    jarvisGoal.findFirst.mockResolvedValue({ id: 'parent' });
    await expect(
      service.decompose('owner', 'parent', [{ title: 'Child' }]),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('only treats Prisma record-not-found as an absent update target', async () => {
    const { jarvisGoal, service } = fixture();
    await expect(service.updateStatus('owner', 'id', 'done')).rejects.toThrow(
      ServiceUnavailableException,
    );
    jarvisGoal.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    expect(await service.updateStatus('owner', 'id', 'done')).toBeNull();
    expect(jarvisGoal.update).toHaveBeenLastCalledWith({
      where: { id: 'id', sessionId: 'owner' },
      data: { status: 'done' },
    });
  });
});
