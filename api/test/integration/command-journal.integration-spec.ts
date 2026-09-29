import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import {
  CommandJournalService,
  type CommandProposal,
} from '../../src/commands/command-journal.service';

describe('Durable command journal in PostgreSQL', () => {
  const prisma = new PrismaService();
  const journal = new CommandJournalService(prisma);
  let conversationId: string;
  let sequence = 0;
  const proposal = (): CommandProposal => ({
    ownerId: 'command-a',
    conversationId,
    requestId: `request-${sequence++}`,
    toolName: 'todo.delete',
    toolVersion: '1',
    arguments: { id: 'resolved-todo-id' },
    targets: [{ id: 'resolved-todo-id', text: 'Exact approved target' }],
    expiresAt: new Date(Date.now() + 600000),
  });
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ['command-a', 'command-b'])
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.invalid` },
      });
    conversationId = await new ConversationService(prisma).resolve(
      'command-a',
      'main',
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('deduplicates concurrent requests durably and refuses changed payloads', async () => {
    const input = proposal();
    const rows = await Promise.all(
      Array.from({ length: 6 }, () => journal.propose(input)),
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    const restarted = new CommandJournalService(prisma);
    expect((await restarted.propose(input)).id).toBe(rows[0].id);
    await expect(
      restarted.propose({ ...input, arguments: { id: 'different-target' } }),
    ).rejects.toThrow('autre commande');
    expect(
      (await journal.read('command-a', rows[0].id))?.transitions,
    ).toHaveLength(1);
  });

  it('canonicalizes object order and rejects oversized or non-JSON envelopes', async () => {
    const input = { ...proposal(), arguments: { a: 1, b: 2 } };
    const row = await journal.propose(input);
    expect(
      (await journal.propose({ ...input, arguments: { b: 2, a: 1 } })).id,
    ).toBe(row.id);
    await expect(
      journal.propose({ ...proposal(), arguments: { value: Number.NaN } }),
    ).rejects.toThrow('invalide');
    await expect(
      journal.propose({
        ...proposal(),
        arguments: { text: 'x'.repeat(32769) },
      }),
    ).rejects.toThrow('volumineuse');
  });

  it('binds approvals to immutable arguments and permits one execution claim', async () => {
    const row = await journal.propose(proposal());
    await expect(
      journal.advance('command-a', row.id, 0, 'executing'),
    ).rejects.toThrow();
    await journal.advance('command-a', row.id, 0, 'waiting');
    await expect(
      journal.advance('command-a', row.id, 1, 'executing'),
    ).rejects.toThrow();
    await expect(
      journal.approve('command-a', row.id, 1, '0'.repeat(64)),
    ).rejects.toThrow();
    await journal.approve('command-a', row.id, 1, row.digest);
    await expect(
      prisma.command.update({
        where: { id: row.id },
        data: { arguments: { id: 'altered' }, revision: { increment: 1 } },
      }),
    ).rejects.toThrow();
    const claims = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        journal.advance('command-a', row.id, 2, 'executing'),
      ),
    );
    expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(
      1,
    );
    await journal.advance(
      'command-a',
      row.id,
      3,
      'unknown',
      'PROVIDER_TIMEOUT',
    );
    await expect(
      journal.advance('command-a', row.id, 4, 'executing'),
    ).rejects.toThrow();
    await journal.advance(
      'command-a',
      row.id,
      4,
      'completed',
      'RECONCILED_PROVIDER_RECEIPT',
    );
    await expect(
      journal.advance('command-a', row.id, 5, 'waiting'),
    ).rejects.toThrow();
    const saved = await journal.read('command-a', row.id);
    expect(saved?.transitions.map((event) => event.toState)).toEqual([
      'proposed',
      'waiting',
      'waiting',
      'executing',
      'unknown',
      'completed',
    ]);
    expect(saved?.approvedDigest).toBe(row.digest);
  });

  it('snapshots caller-owned input before asynchronous persistence', async () => {
    const input = proposal();
    const expectedExpiry = input.expiresAt.toISOString();
    const pending = journal.propose(input);
    input.arguments = { id: 'changed-after-proposal' };
    input.targets = [{ id: 'different-target' }];
    input.expiresAt.setFullYear(2040);
    const saved = await pending;
    expect(saved.arguments).toEqual({ id: 'resolved-todo-id' });
    expect(saved.targets).toEqual([
      { id: 'resolved-todo-id', text: 'Exact approved target' },
    ]);
    expect(saved.expiresAt.toISOString()).toBe(expectedExpiry);
  });

  it('rejects foreign reads, approval, transitions and inconsistent owner bindings', async () => {
    const input = proposal();
    const row = await journal.propose(input);
    expect(await journal.read('command-b', row.id)).toBeNull();
    await expect(
      journal.read(undefined as unknown as string, row.id),
    ).rejects.toThrow('Identifiant invalide');
    await expect(
      journal.advance(
        'command-a',
        row.id,
        undefined as unknown as number,
        'waiting',
      ),
    ).rejects.toThrow('Révision invalide');
    await expect(
      journal.propose({ ...input, ownerId: 'command-b' }),
    ).rejects.toThrow();
    await expect(
      journal.advance('command-b', row.id, 0, 'waiting'),
    ).rejects.toThrow();
    await journal.advance('command-a', row.id, 0, 'waiting');
    await expect(
      journal.approve('command-b', row.id, 1, row.digest),
    ).rejects.toThrow();
    await expect(
      prisma.command.create({
        data: { ...input, ownerId: 'command-b', digest: row.digest },
      }),
    ).rejects.toThrow();
    expect((await journal.read('command-a', row.id))?.revision).toBe(1);
  });

  it('rejects terminal rewrites and rolls back history with its state update', async () => {
    const row = await journal.propose(proposal());
    await prisma
      .$transaction(async (tx) => {
        await tx.command.update({
          where: { id: row.id },
          data: { state: 'waiting', revision: 1 },
        });
        throw new Error('rollback-fixture');
      })
      .catch((error: unknown) => {
        expect(String(error)).toContain('rollback-fixture');
      });
    expect((await journal.read('command-a', row.id))?.transitions).toHaveLength(
      1,
    );
    await journal.advance('command-a', row.id, 0, 'cancelled');
    await expect(
      journal.advance('command-a', row.id, 1, 'waiting'),
    ).rejects.toThrow();
    await expect(
      prisma.command.update({
        where: { id: row.id },
        data: { toolVersion: '2', revision: 2 },
      }),
    ).rejects.toThrow();
  });

  it('expires unexecuted commands and rejects late approval without losing history', async () => {
    const input = { ...proposal(), expiresAt: new Date(Date.now() + 1000) };
    const row = await journal.propose(input);
    await journal.advance('command-a', row.id, 0, 'waiting');
    await prisma.$queryRaw`SELECT 1 FROM pg_sleep(1.1)`;
    await expect(
      journal.approve('command-a', row.id, 1, row.digest),
    ).rejects.toThrow();
    await journal.advance('command-a', row.id, 1, 'expired');
    expect((await journal.propose(input)).state).toBe('expired');
    expect((await journal.read('command-a', row.id))?.transitions).toHaveLength(
      3,
    );
  });

  it('enforces approval and append-only history even for direct database writes', async () => {
    const row = await journal.propose(proposal());
    await journal.advance('command-a', row.id, 0, 'waiting');
    await expect(
      prisma.command.update({
        where: { id: row.id },
        data: { approvedAt: new Date(), revision: 2 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.commandTransition.deleteMany({ where: { commandId: row.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.commandTransition.update({
        where: { commandId_revision: { commandId: row.id, revision: 0 } },
        data: { toState: 'completed' },
      }),
    ).rejects.toThrow();
    await journal.approve('command-a', row.id, 1, row.digest);
    await journal.advance('command-a', row.id, 2, 'executing');
    await expect(
      journal.advance('command-a', row.id, 3, 'failed'),
    ).rejects.toThrow();
    await journal.advance(
      'command-a',
      row.id,
      3,
      'failed',
      'PROVIDER_REJECTED',
    );
    expect((await journal.read('command-a', row.id))?.state).toBe('failed');
  });
});
