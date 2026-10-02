import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommandRejectedError } from '../../commands/command-rejected.error';
import {
  JarvisMissionService,
  parseMissionPlan,
} from './jarvis-mission.service';

describe('JarvisMissionService helpers', () => {
  it('parses summary, next step and signals from a mission plan', () => {
    const parsed = parseMissionPlan(
      [
        'Mission plan - Démo investisseur',
        '',
        'Evaluation tactique',
        "- J'ai trouvé plusieurs signaux liés à cette mission.",
        '',
        'Signaux pertinents',
        '- Agenda: Demo Stark',
        '- Emails: Validation finale',
        '',
        'Plan recommande',
        '1. Relire les slides.',
        '2. Verrouiller le fil rouge.',
      ].join('\n'),
      'Démo investisseur',
    );

    expect(parsed.summary).toContain('plusieurs signaux');
    expect(parsed.nextStep).toBe('Relire les slides.');
    expect(parsed.keySignals).toEqual(
      expect.arrayContaining([
        'Agenda: Demo Stark',
        'Emails: Validation finale',
      ]),
    );
  });
});

describe('Mission persistence outcomes', () => {
  function fixture() {
    const jarvisMission = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mission' }),
      update: jest.fn().mockResolvedValue({ id: 'mission' }),
    };
    return {
      jarvisMission,
      service: new JarvisMissionService({
        jarvisMission,
      } as unknown as PrismaService),
    };
  }

  it.each(['findFirst', 'create', 'update'] as const)(
    'propagates a sanitized error when %s fails',
    async (operation) => {
      const { jarvisMission, service } = fixture();
      if (operation === 'update')
        jarvisMission.findFirst.mockResolvedValue({ id: 'mission' });
      jarvisMission[operation].mockRejectedValueOnce(
        new Error('private connection details'),
      );
      await expect(
        service.recordPlan('owner', { objective: 'Plan' }, 'Plan'),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );

  it('rejects a blank objective before accessing storage', async () => {
    const { jarvisMission, service } = fixture();
    await expect(
      service.recordPlan('owner', { objective: ' ' }, 'Plan'),
    ).rejects.toThrow(CommandRejectedError);
    expect(jarvisMission.findFirst).not.toHaveBeenCalled();
    expect(jarvisMission.create).not.toHaveBeenCalled();
  });
});
