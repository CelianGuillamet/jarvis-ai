import { ServiceUnavailableException } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './session.guard';
import { AccountPreferencesSchema } from '../contracts/v1';
import { RequestContract } from '../http/request-contract';

describe('Account preferences', () => {
  const preferences = {
    displayTimezone: 'America/Montreal',
    theme: 'light' as const,
    onboardingCompleted: true,
  };
  const request = {
    identity: { userId: 'authenticated-owner', sessionId: 'signed-session' },
  } as AuthenticatedRequest;

  function fixture() {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(preferences);
    const update = jest.fn().mockResolvedValue(preferences);
    const controller = new AccountController(
      { user: { findUniqueOrThrow, update } } as unknown as PrismaService,
      {} as AuthService,
    );
    return { controller, findUniqueOrThrow, update };
  }

  it('reads only the authenticated account and preference fields', async () => {
    const { controller, findUniqueOrThrow } = fixture();
    expect(await controller.preferences(request)).toEqual(preferences);
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'authenticated-owner' },
      select: { displayTimezone: true, theme: true, onboardingCompleted: true },
    });
  });

  it('persists preferences without accepting a client-supplied owner', async () => {
    const { controller, update } = fixture();
    expect(await controller.savePreferences(request, preferences)).toEqual(
      preferences,
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'authenticated-owner' },
      data: preferences,
      select: { displayTimezone: true, theme: true, onboardingCompleted: true },
    });
    expect(() =>
      new RequestContract(AccountPreferencesSchema).transform({
        ...preferences,
        ownerId: 'someone-else',
      }),
    ).toThrow();
  });

  it.each(['Unknown/Timezone', '', 'a'.repeat(101)])(
    'rejects invalid timezone %s',
    (displayTimezone) => {
      expect(
        AccountPreferencesSchema.safeParse({ ...preferences, displayTimezone })
          .success,
      ).toBe(false);
    },
  );

  it.each(['read', 'write'])(
    'does not report success when storage %s fails',
    async (operation) => {
      const { controller, findUniqueOrThrow, update } = fixture();
      findUniqueOrThrow.mockRejectedValue(
        new Error('private database credentials'),
      );
      update.mockRejectedValue(new Error('private database credentials'));
      const result =
        operation === 'read'
          ? controller.preferences(request)
          : controller.savePreferences(request, preferences);
      await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );
});
