import { PrismaService } from '../../src/prisma/prisma.service';
import { CommandJournalService } from '../../src/commands/command-journal.service';
import { collectBetaMetrics } from '../../src/beta/beta-metrics';

describe('Beta metrics against the durable schema', () => {
  const prisma = new PrismaService();
  const ownerId = 'beta-metrics-owner';
  const window = () => ({
    from: new Date(Date.now() - 86_400_000),
    to: new Date(Date.now() + 60_000),
  });
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('counts a new onboarded account, its first useful action and its outcomes', async () => {
    const before = await collectBetaMetrics(prisma, window());
    await prisma.betaInvite.create({
      data: { email: 'metrics@example.invalid' },
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        name: ownerId,
        email: 'metrics@example.invalid',
        onboardingCompleted: true,
      },
    });
    const conversationId = (
      await prisma.conversation.create({
        data: { ownerId, clientKey: 'metrics' },
      })
    ).id;
    const journal = new CommandJournalService(prisma);
    for (const state of ['completed', 'unknown'] as const) {
      const command = await journal.propose({
        ownerId,
        conversationId,
        requestId: `metrics-${state}`,
        toolName: 'note.add',
        toolVersion: '1',
        source: 'direct',
        arguments: { text: 'Private arguments' },
        targets: [],
        expiresAt: new Date(Date.now() + 60_000),
      });
      await journal.advance(ownerId, command.id, 0, 'waiting');
      await journal.approve(ownerId, command.id, 1, command.digest);
      await journal.advance(ownerId, command.id, 2, 'executing');
      await journal.advance(ownerId, command.id, 3, state, 'TEST_RESULT');
    }
    const after = await collectBetaMetrics(prisma, window());

    expect(after.invites.active - before.invites.active).toBe(1);
    expect(
      after.accounts.createdInWindow - before.accounts.createdInWindow,
    ).toBe(1);
    expect(after.accounts.onboarded - before.accounts.onboarded).toBe(1);
    expect(
      after.firstUsefulAction.accountsWithAction -
        before.firstUsefulAction.accountsWithAction,
    ).toBe(1);
    expect(
      after.commands.byOutcome.completed - before.commands.byOutcome.completed,
    ).toBe(1);
    expect(
      after.commands.byOutcome.unknown - before.commands.byOutcome.unknown,
    ).toBe(1);
    expect(
      after.repeatUse.activeAccounts - before.repeatUse.activeAccounts,
    ).toBe(1);
    expect(JSON.stringify(after)).not.toContain('Private arguments');
    expect(JSON.stringify(after)).not.toContain(ownerId);
  });
});
