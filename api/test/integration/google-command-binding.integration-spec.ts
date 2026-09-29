import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { PendingActionsService } from '../../src/jarvis/services/pending-action.service';
import { GoogleCredentialService } from '../../src/google/google-credential.service';
import { TokenEncryptionService } from '../../src/google/token-encryption.service';
import {
  loadGoogleAccount,
  withGoogleAccountBinding,
} from '../../src/commands/google-account-binding';
import type { ToolOnly } from '../../src/jarvis/tools/tool-registry';

describe('Command Google account binding', () => {
  const prisma = new PrismaService();
  const pending = new PendingActionsService(prisma, new ConfigService());
  const credentials = new GoogleCredentialService(
    prisma,
    new TokenEncryptionService(new ConfigService()),
  );
  const call: ToolOnly = {
    type: 'tool',
    name: 'gmail.send',
    args: {
      to: 'recipient@example.invalid',
      subject: 'Fixture',
      text: 'Fixture',
    },
  };
  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture(name: string) {
    const ownerId = `command-google-${name}`;
    await prisma.user.create({
      data: { id: ownerId, name, email: `${ownerId}@example.invalid` },
    });
    const conversationId = await new ConversationService(prisma).resolve(
      ownerId,
      'main',
    );
    const account = await prisma.integrationAccount.create({
      data: { ownerId, provider: 'google', providerSubject: `${name}-subject` },
    });
    return { ownerId, conversationId, account };
  }

  it('refuses a claim after disconnect/reconnect, even with the same Google subject', async () => {
    const { ownerId, conversationId, account } = await fixture('reconnect');
    const id = await pending.create(conversationId, call, [], account);
    expect((await pending.peek(id, conversationId))?.googleAccount).toEqual({
      id: account.id,
      providerSubject: account.providerSubject,
    });
    await prisma.integrationAccount.delete({ where: { id: account.id } });
    const replacement = await prisma.integrationAccount.create({
      data: {
        ownerId,
        provider: 'google',
        providerSubject: account.providerSubject,
      },
    });
    expect(replacement.id).not.toBe(account.id);
    await expect(pending.consume(id, conversationId)).rejects.toThrow(
      'compte Google a changé',
    );
    expect(
      (await prisma.command.findUniqueOrThrow({ where: { id } })).state,
    ).toBe('waiting');
    const newId = await pending.create(conversationId, call, [], replacement);
    expect(
      (await pending.consume(newId, conversationId))?.googleAccount?.id,
    ).toBe(replacement.id);
  });

  it('rejects an account switch during target resolution before persisting a proposal', async () => {
    const { ownerId, conversationId, account } = await fixture('preparation');
    const captured = await loadGoogleAccount(prisma, ownerId);
    await prisma.integrationAccount.update({
      where: { id: account.id },
      data: { providerSubject: 'changed-during-preparation' },
    });
    await expect(
      pending.create(conversationId, call, [], captured),
    ).rejects.toThrow('compte Google a changé');
    expect(await prisma.command.count({ where: { conversationId } })).toBe(0);
  });

  it('checks the bound account at each credential load during compound execution', async () => {
    const { conversationId, account } = await fixture('execution');
    await withGoogleAccountBinding(conversationId, account, async () => {
      // A credential-free fixture still verifies the integration identity.
      expect(await credentials.find(conversationId)).toBeNull();
      await prisma.integrationAccount.update({
        where: { id: account.id },
        data: { providerSubject: 'changed-between-steps' },
      });
      await expect(credentials.find(conversationId)).rejects.toThrow(
        'compte Google a changé',
      );
    });
    // The execution binding must not leak to later unrelated requests.
    expect(await credentials.find(conversationId)).toBeNull();
  });

  it('isolates concurrent execution contexts and rejects a different conversation', async () => {
    const a = await fixture('parallel-a');
    const b = await fixture('parallel-b');
    await Promise.all(
      [a, b].map(({ conversationId, account }) =>
        withGoogleAccountBinding(conversationId, account, async () => {
          await Promise.resolve();
          expect(await credentials.find(conversationId)).toBeNull();
        }),
      ),
    );
    await withGoogleAccountBinding(a.conversationId, a.account, async () => {
      await expect(credentials.find(b.conversationId)).rejects.toThrow(
        'Conversation de commande invalide',
      );
    });
  });
});
