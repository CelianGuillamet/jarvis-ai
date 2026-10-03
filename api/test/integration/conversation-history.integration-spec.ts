import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { ConversationHistoryService } from '../../src/jarvis/services/conversation-history.service';
import { CommandJournalService } from '../../src/commands/command-journal.service';
import { ConversationHistoryResponseSchema } from '../../src/contracts/v1';

describe('Durable conversation history in PostgreSQL', () => {
  const prisma = new PrismaService();
  const history = new ConversationHistoryService(prisma);
  let a: string;
  let b: string;
  let pageConversation: string;

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ['history-a', 'history-b']) {
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.invalid` },
      });
    }
    const conversations = new ConversationService(prisma);
    a = await conversations.resolve('history-a', 'history');
    b = await conversations.resolve('history-b', 'history');
    pageConversation = await conversations.resolve('history-a', 'pagination');
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('restores the exact response and live command reference in a new service instance', async () => {
    const journal = new CommandJournalService(prisma);
    const command = await journal.propose({
      ownerId: 'history-a',
      conversationId: a,
      requestId: 'history-pending',
      toolName: 'todo.delete',
      toolVersion: '1',
      arguments: { id: 'target' },
      targets: [{ id: 'target', text: 'Cible exacte' }],
      expiresAt: new Date(Date.now() + 600000),
    });
    await journal.advance('history-a', command.id, 0, 'waiting');
    const result = await history.capture(
      'history-a',
      a,
      'chat',
      'Supprimer',
      () =>
        Promise.resolve({
          text: 'Confirmez cette cible.',
          meta: { commandId: command.id, commandState: 'waiting' },
        }),
    );
    const restored = ConversationHistoryResponseSchema.parse(
      await new ConversationHistoryService(prisma).list('history-a', a, {
        limit: 20,
      }),
    );
    expect(restored.turns).toHaveLength(1);
    expect(restored.turns[0].response).toEqual(result);
    expect(restored.turns[0].command).toEqual({
      id: command.id,
      state: 'waiting',
    });
    expect(restored.pendingCommand?.id).toBe(command.id);
    expect(Number.isFinite(Date.parse(restored.fetchedAt))).toBe(true);
    await journal.advance('history-a', command.id, 1, 'cancelled');
    const cancelled = await history.list('history-a', a, { limit: 20 });
    expect(cancelled.pendingCommand).toBeNull();
    expect(cancelled.turns[0].command?.state).toBe('cancelled');
    // The rendered historical response remains immutable evidence of that turn.
    expect(cancelled.turns[0].response).toEqual(result);
  });

  it('rejects foreign conversations and foreign cursors without exposing their history', async () => {
    const result = await history.capture('history-b', b, 'chat', 'Privé', () =>
      Promise.resolve({ text: 'Secret B' }),
    );
    await expect(history.list('history-a', b, { limit: 20 })).rejects.toThrow(
      'Conversation introuvable',
    );
    await expect(
      history.list('history-a', a, {
        limit: 20,
        cursor: result.meta!.historyTurnId,
      }),
    ).rejects.toThrow('Page introuvable');
    const operation = jest.fn();
    await expect(
      history.capture('history-a', b, 'chat', 'Interdit', operation),
    ).rejects.toThrow('Conversation introuvable');
    expect(operation).not.toHaveBeenCalled();
  });

  it('paginates equal timestamps without duplicates or skipped turns as new turns arrive', async () => {
    const createdAt = new Date('2026-01-01T12:00:00Z');
    for (const suffix of ['a', 'b', 'c', 'd', 'e']) {
      await prisma.conversationTurn.create({
        data: {
          id: `history-page-${suffix}`,
          ownerId: 'history-a',
          conversationId: pageConversation,
          kind: 'chat',
          inputText: suffix,
          createdAt,
        },
      });
    }
    const first = await history.list('history-a', pageConversation, {
      limit: 2,
    });
    expect(first.turns.map((turn) => turn.inputText)).toEqual(['d', 'e']);
    await history.capture('history-a', pageConversation, 'chat', 'new', () =>
      Promise.resolve({ text: 'Nouveau' }),
    );
    const second = await history.list('history-a', pageConversation, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    const third = await history.list('history-a', pageConversation, {
      limit: 2,
      cursor: second.nextCursor!,
    });
    expect(second.turns.map((turn) => turn.inputText)).toEqual(['b', 'c']);
    expect(third.turns.map((turn) => turn.inputText)).toEqual(['a']);
    expect(third.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.turns, ...second.turns, ...third.turns].map(
          (turn) => turn.id,
        ),
      ).size,
    ).toBe(5);
  });

  it('keeps interrupted requests visible without claiming that their effects failed', async () => {
    await expect(
      history.capture('history-b', b, 'confirm', 'uncertain-command', () =>
        Promise.reject(new Error('response lost')),
      ),
    ).rejects.toThrow('response lost');
    const restored = ConversationHistoryResponseSchema.parse(
      await history.list('history-b', b, { limit: 20 }),
    );
    const failed = restored.turns.find(
      (turn) => turn.inputText === 'uncertain-command',
    );
    expect(failed).toMatchObject({
      kind: 'confirm',
      state: 'failed',
      response: null,
      command: null,
    });
  });

  it('enforces conversation ownership and state/response coherence in the database', async () => {
    await expect(
      prisma.conversationTurn.create({
        data: {
          ownerId: 'history-a',
          conversationId: b,
          kind: 'chat',
          inputText: 'forged',
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.conversationTurn.create({
        data: {
          ownerId: 'history-a',
          conversationId: a,
          kind: 'chat',
          inputText: 'missing response',
          state: 'completed',
        },
      }),
    ).rejects.toThrow();
  });
});
