import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { TokenEncryptionService } from '../../src/google/token-encryption.service';
import { OAuthStateService } from '../../src/google/oauth-state.service';
import { GoogleCredentialService } from '../../src/google/google-credential.service';

describe('Google authorization and encrypted credentials in PostgreSQL', () => {
  const prisma = new PrismaService();
  const encryption = new TokenEncryptionService(new ConfigService());
  const states = new OAuthStateService(prisma, encryption);
  const vault = new GoogleCredentialService(prisma, encryption);
  let a: string;
  let otherConversation: string;
  let b: string;
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ['google-a', 'google-b'])
      await prisma.user.create({
        data: {
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
    const conversations = new ConversationService(prisma);
    a = await conversations.resolve('google-a', 'main');
    otherConversation = await conversations.resolve('google-a', 'another');
    b = await conversations.resolve('google-b', 'main');
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('survives service restart, binds owner and login session, and allows one atomic claim', async () => {
    const pending = await states.create({
      ownerId: 'google-a',
      authSessionId: 'login-a',
      conversationId: a,
    });
    const restarted = new OAuthStateService(prisma, encryption);
    expect(
      await restarted.consume(pending.state, 'google-b', 'login-a'),
    ).toBeNull();
    expect(
      await restarted.consume(pending.state, 'google-a', 'login-b'),
    ).toBeNull();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        restarted.consume(pending.state, 'google-a', 'login-a'),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const claimed = results.find(Boolean)!;
    expect(claimed.conversationId).toBe(a);
    expect(claimed.nonce).toBe(pending.nonce);
    const stored = await prisma.googleOAuthState.findUniqueOrThrow({
      where: { digest: claimed.digest },
    });
    expect(stored.digest).not.toBe(pending.state);
    expect(stored.verifier).not.toContain(claimed.verifier);
    expect(
      await restarted.consume(pending.state, 'google-a', 'login-a'),
    ).toBeNull();
  });

  it('rejects expired state and foreign conversation binding', async () => {
    const pending = await states.create({
      ownerId: 'google-a',
      authSessionId: 'expiry',
      conversationId: a,
    });
    await prisma.googleOAuthState.updateMany({
      where: { authSessionId: 'expiry' },
      data: { expiresAt: new Date(0) },
    });
    expect(
      await states.consume(pending.state, 'google-a', 'expiry'),
    ).toBeNull();
    await expect(
      states.create({
        ownerId: 'google-b',
        authSessionId: 'b',
        conversationId: a,
      }),
    ).rejects.toThrow();
  });

  it('encrypts persisted tokens, shares only within an owner, and rejects foreign provider identity', async () => {
    const row = await vault.save('google-a', 'verified-sub-a', a, {
      refresh_token: 'refresh-A-secret',
      access_token: 'access-A-secret',
      scope: 'scope-a',
    });
    expect(JSON.stringify(row)).not.toContain('refresh-A-secret');
    expect(JSON.stringify(row)).not.toContain('access-A-secret');
    expect(vault.credentials(row).refresh_token).toBe('refresh-A-secret');
    expect((await vault.find(otherConversation))?.id).toBe(row.id);
    expect(await vault.find(b)).toBeNull();
    await expect(
      vault.save('google-b', 'verified-sub-a', b, { refresh_token: 'other' }),
    ).rejects.toThrow();
    await expect(
      vault.save('google-b', 'verified-sub-b', a, { refresh_token: 'other' }),
    ).rejects.toThrow();
    await expect(
      prisma.googleOAuthToken.create({
        data: { sessionId: 'plaintext', refreshToken: 'secret' },
      }),
    ).rejects.toThrow();
  });

  it('removes local access even when a decryption key is missing', async () => {
    await vault.save('google-b', 'verified-sub-b', b, {
      refresh_token: 'B-private',
    });
    const missingKey = new GoogleCredentialService(
      prisma,
      new TokenEncryptionService(
        new ConfigService({
          GOOGLE_TOKEN_KEYS: '{}',
          GOOGLE_TOKEN_ACTIVE_KEY: '',
        }),
      ),
    );
    expect(await missingKey.disconnect('google-b')).toEqual({
      refresh_token: null,
    });
    expect(await vault.find(b)).toBeNull();
    expect(await vault.find(a)).not.toBeNull();
  });

  it('keeps refresh tokens on reconnect, rejects stale refreshes and cannot resurrect revocation', async () => {
    const old = (await vault.find(a))!;
    const next = await vault.save('google-a', 'verified-sub-a', a, {
      access_token: 'new-access',
    });
    expect(vault.credentials(next).refresh_token).toBe('refresh-A-secret');
    expect(next.generation).not.toBe(old.generation);
    await vault.refresh(old, { refresh_token: 'stale-refresh' });
    expect(vault.credentials((await vault.find(a))!).refresh_token).toBe(
      'refresh-A-secret',
    );
    await vault.refresh(next, { refresh_token: 'fresh-refresh' });
    expect(vault.credentials((await vault.find(a))!).refresh_token).toBe(
      'fresh-refresh',
    );
    const pending = await states.create({
      ownerId: 'google-a',
      authSessionId: 'revoke-race',
      conversationId: a,
    });
    const grant = (await states.consume(
      pending.state,
      'google-a',
      'revoke-race',
    ))!;
    const removed = await vault.disconnect('google-a');
    expect(removed?.refresh_token).toBe('fresh-refresh');
    expect(await vault.find(a)).toBeNull();
    await vault.refresh(next, { refresh_token: 'resurrected' });
    await expect(
      vault.save(
        'google-a',
        'verified-sub-a',
        a,
        { refresh_token: 'late-callback' },
        grant.digest,
      ),
    ).rejects.toThrow();
    expect(await vault.find(a)).toBeNull();
    expect(await vault.disconnect('google-a')).toBeNull();
  });
});
