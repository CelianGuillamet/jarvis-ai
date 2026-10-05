import { PrismaService } from '../../src/prisma/prisma.service';
import { InboxReplyDraftService } from '../../src/inbox-zero/inbox-reply-draft.service';

describe('Owned versioned reply drafts', () => {
  const prisma = new PrismaService();
  let conversationId: string;
  const ownerId = 'reply-draft-owner';
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: ownerId, name: ownerId, email: 'draft@example.invalid' },
    });
    conversationId = (
      await prisma.conversation.create({
        data: { ownerId, clientKey: 'draft' },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('restores text with a fresh service and preserves concurrent newer edits', async () => {
    const service = new InboxReplyDraftService(prisma);
    expect(
      (await service.read(ownerId, conversationId, 'message')).draft,
    ).toBeNull();
    const first = await service.save(ownerId, conversationId, {
      messageId: 'message',
      text: 'Private reply',
      version: 0,
    });
    expect(first.draft.version).toBe(1);
    expect(
      (
        await new InboxReplyDraftService(prisma).read(
          ownerId,
          conversationId,
          'message',
        )
      ).draft?.text,
    ).toBe('Private reply');
    const results = await Promise.allSettled(
      ['A', 'B'].map((text) =>
        service.save(ownerId, conversationId, {
          messageId: 'message',
          text,
          version: 1,
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const current = (await service.read(ownerId, conversationId, 'message'))
      .draft!;
    expect(current.version).toBe(2);
    await expect(
      service.save(ownerId, conversationId, {
        messageId: 'message',
        text: '',
        version: 1,
      }),
    ).rejects.toThrow('autre onglet');
    expect(
      (await service.read(ownerId, conversationId, 'message')).draft?.text,
    ).toBe(current.text);
  });
  it('does not permit a foreign owner to read or overwrite a draft', async () => {
    const service = new InboxReplyDraftService(prisma);
    await expect(
      service.read('foreign', conversationId, 'message'),
    ).rejects.toThrow('Conversation introuvable');
    await expect(
      service.save('foreign', conversationId, {
        messageId: 'message',
        text: 'Overwrite',
        version: 2,
      }),
    ).rejects.toThrow('Conversation introuvable');
  });
});
