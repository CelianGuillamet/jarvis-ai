import type { PrismaClient } from '@prisma/client';
import { collectBetaMetrics } from './beta-metrics';

const at = (iso: string) => new Date(iso);
const rows =
  <T>(value: T[]) =>
  () =>
    Promise.resolve(value);

function fakePrisma() {
  return {
    betaInvite: {
      findMany: rows([
        { revokedAt: null, expiresAt: null },
        { revokedAt: at('2026-10-02T00:00:00Z'), expiresAt: null },
        { revokedAt: null, expiresAt: at('2000-01-01T00:00:00Z') },
      ]),
    },
    user: {
      findMany: rows([
        {
          id: 'a',
          createdAt: at('2026-10-01T10:00:00Z'),
          onboardingCompleted: true,
        },
        {
          id: 'b',
          createdAt: at('2026-10-01T12:00:00Z'),
          onboardingCompleted: true,
        },
        {
          id: 'c',
          createdAt: at('2026-09-01T12:00:00Z'),
          onboardingCompleted: false,
        },
      ]),
    },
    command: {
      findMany: rows([
        {
          ownerId: 'a',
          state: 'completed',
          createdAt: at('2026-10-01T10:30:00Z'),
        },
        {
          ownerId: 'a',
          state: 'unknown',
          createdAt: at('2026-10-03T09:00:00Z'),
        },
        {
          ownerId: 'b',
          state: 'failed',
          createdAt: at('2026-10-01T13:00:00Z'),
        },
        {
          ownerId: 'b',
          state: 'waiting',
          createdAt: at('2026-10-01T13:05:00Z'),
        },
      ]),
    },
    commandTransition: {
      findMany: rows([
        { createdAt: at('2026-10-01T10:30:00Z'), command: { ownerId: 'a' } },
        { createdAt: at('2026-10-01T14:00:00Z'), command: { ownerId: 'b' } },
        { createdAt: at('2026-10-02T10:00:00Z'), command: { ownerId: 'a' } },
      ]),
    },
    conversationTurn: {
      findMany: rows([{ ownerId: 'b', createdAt: at('2026-10-04T08:00:00Z') }]),
    },
  } as unknown as PrismaClient;
}

describe('collectBetaMetrics', () => {
  const window = {
    from: at('2026-10-01T00:00:00Z'),
    to: at('2026-10-08T00:00:00Z'),
  };

  it('aggregates activation, outcomes and repeat use without identifiers', async () => {
    const metrics = await collectBetaMetrics(fakePrisma(), window);
    expect(metrics.invites).toEqual({ active: 1, revoked: 1 });
    expect(metrics.accounts).toEqual({
      total: 3,
      createdInWindow: 2,
      onboarded: 2,
    });
    expect(metrics.firstUsefulAction).toEqual({
      accountsWithAction: 2,
      medianMinutesFromSignUp: 75,
    });
    expect(metrics.commands.byOutcome).toEqual({
      completed: 1,
      failed: 1,
      unknown: 1,
      cancelled: 0,
      expired: 0,
      open: 1,
    });
    expect(metrics.commands.successRate).toBeCloseTo(1 / 3);
    expect(metrics.repeatUse).toEqual({
      activeAccounts: 2,
      accountsActiveOnTwoOrMoreDays: 2,
      medianActiveDays: 2,
    });
    expect(metrics.notInstrumented).toHaveLength(2);
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toMatch(/"a"|"b"|ownerId|@/);
  });

  it('reports empty cohorts as null rather than zero rates', async () => {
    const empty = {
      betaInvite: { findMany: rows([]) },
      user: { findMany: rows([]) },
      command: { findMany: rows([]) },
      commandTransition: { findMany: rows([]) },
      conversationTurn: { findMany: rows([]) },
    } as unknown as PrismaClient;
    const metrics = await collectBetaMetrics(empty, window);
    expect(metrics.commands.successRate).toBeNull();
    expect(metrics.firstUsefulAction.medianMinutesFromSignUp).toBeNull();
    expect(metrics.repeatUse.medianActiveDays).toBeNull();
  });

  it('rejects an inverted window', async () => {
    await expect(
      collectBetaMetrics(fakePrisma(), { from: window.to, to: window.from }),
    ).rejects.toThrow('Invalid metrics window');
  });
});
