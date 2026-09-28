import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';

type OAuthBinding = {
  ownerId: string;
  authSessionId: string;
  conversationId: string;
};
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class OAuthStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async create(binding: OAuthBinding) {
    this.encryption.assertConfigured();
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: binding.conversationId, ownerId: binding.ownerId },
    });
    if (!conversation) throw new Error('Invalid OAuth conversation.');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const stateDigest = digest(state);
    await this.prisma.googleOAuthState.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await this.prisma.googleOAuthState.create({
      data: {
        ...binding,
        digest: stateDigest,
        verifier: this.encryption.encrypt(
          verifier,
          `oauth-state:${stateDigest}`,
        ),
        nonce,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return {
      state,
      nonce,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    };
  }

  async consume(state: string, ownerId: string, authSessionId: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
    const where = {
      digest: digest(state),
      ownerId,
      authSessionId,
      expiresAt: { gt: new Date() },
      consumedAt: null,
    };
    const row = await this.prisma.googleOAuthState.findFirst({ where });
    if (!row) return null;
    // Atomic claim across processes. A losing callback never exchanges its code.
    const claimed = await this.prisma.googleOAuthState.updateMany({
      where,
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    return {
      digest: row.digest,
      conversationId: row.conversationId,
      nonce: row.nonce,
      verifier: this.encryption.decrypt(
        row.verifier,
        `oauth-state:${row.digest}`,
      ),
    };
  }
}
