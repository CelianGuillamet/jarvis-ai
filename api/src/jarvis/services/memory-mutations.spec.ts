import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisMemoryService } from './jarvis-memory.service';

describe('Explicit memory mutation failures', () => {
  const input = {
    layer: 'identity' as const,
    key: 'name',
    label: 'Name',
    value: 'Test',
  };
  function fixture() {
    const jarvisMemoryFact = {
      upsert: jest
        .fn()
        .mockRejectedValue(new Error('private database details')),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    return {
      jarvisMemoryFact,
      service: new JarvisMemoryService(
        { jarvisMemoryFact } as unknown as PrismaService,
        new ConfigService(),
      ),
    };
  }
  it('propagates an unavailable write instead of a validation result', async () => {
    const { service } = fixture();
    await expect(service.upsertFact('owner', input)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
  it('keeps invalid input separate from a storage failure', async () => {
    const { service, jarvisMemoryFact } = fixture();
    expect(
      await service.upsertFact('owner', { ...input, value: '' }),
    ).toBeNull();
    expect(jarvisMemoryFact.upsert).not.toHaveBeenCalled();
  });
  it('distinguishes absent memory from failed deletion', async () => {
    const { service, jarvisMemoryFact } = fixture();
    expect(await service.forgetFact('owner', input)).toBe(false);
    jarvisMemoryFact.deleteMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(service.forgetFact('owner', input)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
