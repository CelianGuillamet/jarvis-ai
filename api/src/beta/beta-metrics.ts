import type { PrismaClient } from '@prisma/client';

const OUTCOMES = [
  'completed',
  'failed',
  'unknown',
  'cancelled',
  'expired',
] as const;
const DAY_MS = 86_400_000;

export type BetaMetricsWindow = { from: Date; to: Date };

export type BetaMetrics = {
  window: { from: string; to: string };
  invites: { active: number; revoked: number };
  accounts: { total: number; createdInWindow: number; onboarded: number };
  firstUsefulAction: {
    accountsWithAction: number;
    medianMinutesFromSignUp: number | null;
  };
  commands: {
    total: number;
    byOutcome: Record<(typeof OUTCOMES)[number] | 'open', number>;
    successRate: number | null;
  };
  repeatUse: {
    activeAccounts: number;
    accountsActiveOnTwoOrMoreDays: number;
    medianActiveDays: number | null;
  };
  notInstrumented: string[];
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Aggregates only: no identifier, address, argument or message content leaves this function.
export async function collectBetaMetrics(
  prisma: PrismaClient,
  { from, to }: BetaMetricsWindow,
): Promise<BetaMetrics> {
  if (!(from < to)) throw new Error('Invalid metrics window');
  const now = new Date();
  const inWindow = { gte: from, lt: to };
  const [invites, users, commands, firstCompletions, turns] = await Promise.all(
    [
      prisma.betaInvite.findMany({
        select: { revokedAt: true, expiresAt: true },
      }),
      prisma.user.findMany({
        select: { id: true, createdAt: true, onboardingCompleted: true },
      }),
      prisma.command.findMany({
        where: { createdAt: inWindow },
        select: { ownerId: true, state: true, createdAt: true },
      }),
      prisma.commandTransition.findMany({
        where: { toState: 'completed' },
        select: { createdAt: true, command: { select: { ownerId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.conversationTurn.findMany({
        where: { createdAt: inWindow },
        select: { ownerId: true, createdAt: true },
      }),
    ],
  );

  const byOutcome = Object.fromEntries(
    [...OUTCOMES, 'open'].map((state) => [state, 0]),
  ) as BetaMetrics['commands']['byOutcome'];
  for (const command of commands) {
    const key = (OUTCOMES as readonly string[]).includes(command.state)
      ? (command.state as (typeof OUTCOMES)[number])
      : 'open';
    byOutcome[key] += 1;
  }
  const settled = OUTCOMES.reduce((sum, state) => sum + byOutcome[state], 0);

  const signUp = new Map(users.map((user) => [user.id, user.createdAt]));
  const firstAction = new Map<string, Date>();
  for (const transition of firstCompletions) {
    const owner = transition.command.ownerId;
    if (!firstAction.has(owner)) firstAction.set(owner, transition.createdAt);
  }
  const delays = [...firstAction].flatMap(([owner, at]) => {
    const created = signUp.get(owner);
    return created ? [(at.getTime() - created.getTime()) / 60_000] : [];
  });

  const activeDays = new Map<string, Set<number>>();
  for (const event of [...commands, ...turns]) {
    const days = activeDays.get(event.ownerId) ?? new Set<number>();
    days.add(Math.floor(event.createdAt.getTime() / DAY_MS));
    activeDays.set(event.ownerId, days);
  }
  const dayCounts = [...activeDays.values()].map((days) => days.size);

  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    invites: {
      active: invites.filter(
        (invite) =>
          !invite.revokedAt && (!invite.expiresAt || invite.expiresAt > now),
      ).length,
      revoked: invites.filter((invite) => invite.revokedAt).length,
    },
    accounts: {
      total: users.length,
      createdInWindow: users.filter(
        (user) => user.createdAt >= from && user.createdAt < to,
      ).length,
      onboarded: users.filter((user) => user.onboardingCompleted).length,
    },
    firstUsefulAction: {
      accountsWithAction: firstAction.size,
      medianMinutesFromSignUp: median(delays),
    },
    commands: {
      total: commands.length,
      byOutcome,
      successRate: settled ? byOutcome.completed / settled : null,
    },
    repeatUse: {
      activeAccounts: activeDays.size,
      accountsActiveOnTwoOrMoreDays: dayCounts.filter((count) => count >= 2)
        .length,
      medianActiveDays: median(dayCounts),
    },
    notInstrumented: [
      'Model and provider latency (JAR-040)',
      'Per-account model cost (JAR-036)',
    ],
  };
}
