import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { HumanProfileService } from './human-profile.service';

const defaults = { speechMode: 'tu', verbosity: 'normal' } as const;
const stored = {
  speechMode: 'tu',
  verbosity: 'normal',
  preferredName: 'Private name',
  turnCount: 3,
  updatedAt: new Date(),
};

describe('Human profile erasure boundary', () => {
  const services: HumanProfileService[] = [];
  afterEach(async () => {
    for (const service of services.splice(0)) await service.onModuleDestroy();
    jest.restoreAllMocks();
  });
  function fixture(extra: Record<string, string> = {}) {
    const prisma = {
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conversation' }),
      },
      jarvisHumanProfile: {
        findUnique: jest.fn().mockResolvedValue(stored),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new HumanProfileService(
      prisma as unknown as PrismaService,
      new ConfigService({
        HUMAN_PROFILE_PERSIST: 'true',
        HUMAN_PROFILE_FLUSH_INTERVAL_MS: '100000',
        HUMAN_PROFILE_MIN_PERSIST_INTERVAL_MS: '0',
        ...extra,
      }),
    );
    services.push(service);
    return { service, prisma };
  }

  it('checks active conversation ownership even when serving a cached profile', async () => {
    const { service, prisma } = fixture();
    expect((await service.get('conversation', defaults)).preferredName).toBe(
      'Private name',
    );
    prisma.conversation.findFirst.mockResolvedValueOnce(null);
    expect(
      (await service.get('conversation', defaults)).preferredName,
    ).not.toBe('Private name');
    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversation', owner: { disabled: false } },
      select: { id: true },
    });
  });

  it('does not republish a stored profile load invalidated during erasure', async () => {
    const { service, prisma } = fixture();
    let finish!: (value: typeof stored) => void;
    prisma.jarvisHumanProfile.findUnique.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.get('conversation', defaults);
    await Promise.resolve();
    expect(prisma.jarvisHumanProfile.findUnique).toHaveBeenCalledTimes(1);
    service.forget('conversation');
    prisma.conversation.findFirst.mockResolvedValue(null);
    finish(stored);
    expect((await pending).preferredName).not.toBe('Private name');
    expect(
      (await service.get('conversation', defaults)).preferredName,
    ).not.toBe('Private name');
    expect(prisma.jarvisHumanProfile.findUnique).toHaveBeenCalledTimes(1);
  });

  it('does not retain or persist user text after an invalidated profile load', async () => {
    const { service, prisma } = fixture();
    let finish!: (value: typeof stored) => void;
    prisma.jarvisHumanProfile.findUnique.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.updateFromUserText(
      'conversation',
      'Appelle-moi Secret',
      defaults,
    );
    await Promise.resolve();
    service.forget('conversation');
    finish(stored);
    expect((await pending).preferredName).not.toBe('Secret');
    expect(prisma.jarvisHumanProfile.upsert).not.toHaveBeenCalled();
  });

  it('never replaces stored preferences with defaults after a failed read or logs private details', async () => {
    const { service, prisma } = fixture();
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    prisma.jarvisHumanProfile.findUnique.mockRejectedValue(
      new Error('secret-database-details'),
    );
    await service.updateFromUserText(
      'conversation',
      'Appelle-moi Secret',
      defaults,
    );
    expect(prisma.jarvisHumanProfile.upsert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Impossible de lire le profil humain.');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      'secret-database-details',
    );
  });

  it('requires active ownership even when persistence is disabled', async () => {
    const { service, prisma } = fixture({ HUMAN_PROFILE_PERSIST: 'false' });
    prisma.conversation.findFirst.mockResolvedValue(null);
    const profile = await service.updateFromUserText(
      'conversation',
      'Appelle-moi Secret',
      defaults,
    );
    expect(profile.preferredName).not.toBe('Secret');
    expect(prisma.jarvisHumanProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.jarvisHumanProfile.upsert).not.toHaveBeenCalled();
  });

  it('deduplicates and bounds simultaneous profile loads', async () => {
    const { service, prisma } = fixture({ HUMAN_PROFILE_MAX_SESSIONS: '1' });
    let finish!: (value: typeof stored) => void;
    prisma.jarvisHumanProfile.findUnique.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.get('conversation', defaults);
    const duplicate = service.get('conversation', defaults);
    expect((await service.get('another', defaults)).preferredName).not.toBe(
      'Private name',
    );
    expect(prisma.conversation.findFirst).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    finish(stored);
    expect(await duplicate).toEqual(await first);
    expect(prisma.jarvisHumanProfile.findUnique).toHaveBeenCalledTimes(1);
  });
});
