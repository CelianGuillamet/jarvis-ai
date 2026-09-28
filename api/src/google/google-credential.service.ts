import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { GoogleOAuthToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';

export type GoogleTokens = {
  refresh_token?: string | null;
  access_token?: string | null;
  token_type?: string | null;
  scope?: string | null;
  expiry_date?: number | null;
};

@Injectable()
export class GoogleCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async find(conversationId: string) {
    const { ownerId } = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { ownerId: true },
    });
    const integration = await this.prisma.integrationAccount.findUnique({
      where: { ownerId_provider: { ownerId, provider: 'google' } },
      include: { googleToken: true },
    });
    return integration?.googleToken ?? null;
  }

  credentials(row: GoogleOAuthToken) {
    return {
      refresh_token: this.encryption.decrypt(
        row.refreshToken,
        `google:${row.id}:refresh`,
      ),
      access_token: row.accessToken
        ? this.encryption.decrypt(row.accessToken, `google:${row.id}:access`)
        : undefined,
      token_type: row.tokenType ?? undefined,
      scope: row.scope ?? undefined,
      expiry_date: row.expiryDate?.getTime(),
    };
  }

  async save(
    ownerId: string,
    subject: string,
    conversationId: string,
    tokens: GoogleTokens,
    claimedStateDigest?: string,
  ) {
    this.encryption.assertConfigured();
    return this.prisma.$transaction(async (tx) => {
      if (claimedStateDigest) {
        // Keep the claimed row until persistence so disconnect can invalidate
        // callbacks already exchanging a code. Delete and save share one commit.
        const grant = await tx.googleOAuthState.deleteMany({
          where: {
            digest: claimedStateDigest,
            ownerId,
            conversationId,
            consumedAt: { not: null },
            expiresAt: { gt: new Date() },
          },
        });
        if (grant.count !== 1)
          throw new BadRequestException(
            'Autorisation Google expirée ou révoquée.',
          );
      }
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, ownerId },
      });
      if (!conversation)
        throw new BadRequestException('Conversation introuvable.');
      const existing = await tx.integrationAccount.findUnique({
        where: { ownerId_provider: { ownerId, provider: 'google' } },
        include: { googleToken: true },
      });
      if (existing && existing.providerSubject !== subject)
        throw new BadRequestException(
          'Déconnecte le compte Google actuel avant de le remplacer.',
        );
      const claimed = await tx.integrationAccount.findUnique({
        where: {
          provider_providerSubject: {
            provider: 'google',
            providerSubject: subject,
          },
        },
      });
      if (claimed && claimed.ownerId !== ownerId)
        throw new BadRequestException(
          'Ce compte Google ne peut pas être connecté.',
        );
      const account =
        existing ??
        (await tx.integrationAccount.create({
          data: { ownerId, provider: 'google', providerSubject: subject },
        }));
      const old = existing?.googleToken;
      const refreshToken =
        tokens.refresh_token ??
        (old ? this.credentials(old).refresh_token : null);
      if (!refreshToken)
        throw new BadRequestException(
          'Autorisation Google incomplète. Reconnecte le compte.',
        );
      const id = old?.id ?? randomUUID();
      const data = {
        generation: randomUUID(),
        refreshToken: this.encryption.encrypt(
          refreshToken,
          `google:${id}:refresh`,
        ),
        accessToken: tokens.access_token
          ? this.encryption.encrypt(tokens.access_token, `google:${id}:access`)
          : null,
        tokenType: tokens.token_type ?? null,
        scope: tokens.scope ?? null,
        expiryDate:
          tokens.expiry_date == null ? null : new Date(tokens.expiry_date),
      };
      return tx.googleOAuthToken.upsert({
        where: { integrationAccountId: account.id },
        create: {
          id,
          sessionId: conversationId,
          integrationAccountId: account.id,
          ...data,
        },
        update: data,
      });
    });
  }

  async refresh(current: GoogleOAuthToken, tokens: GoogleTokens) {
    const data = {
      ...(tokens.refresh_token
        ? {
            refreshToken: this.encryption.encrypt(
              tokens.refresh_token,
              `google:${current.id}:refresh`,
            ),
          }
        : {}),
      ...(tokens.access_token
        ? {
            accessToken: this.encryption.encrypt(
              tokens.access_token,
              `google:${current.id}:access`,
            ),
          }
        : {}),
      ...(tokens.token_type != null ? { tokenType: tokens.token_type } : {}),
      ...(tokens.scope != null ? { scope: tokens.scope } : {}),
      ...(tokens.expiry_date != null
        ? { expiryDate: new Date(tokens.expiry_date) }
        : {}),
    };
    if (!Object.keys(data).length) return;
    // An old client cannot resurrect a revoked credential or overwrite a reconnect.
    await this.prisma.googleOAuthToken.updateMany({
      where: {
        id: current.id,
        generation: current.generation,
        integrationAccountId: current.integrationAccountId,
      },
      data,
    });
  }

  async disconnect(ownerId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.googleOAuthState.deleteMany({ where: { ownerId } });
      const account = await tx.integrationAccount.findUnique({
        where: { ownerId_provider: { ownerId, provider: 'google' } },
        include: { googleToken: true },
      });
      if (!account) return null;
      let refreshToken: string | null = null;
      if (account.googleToken) {
        try {
          refreshToken = this.credentials(account.googleToken).refresh_token;
        } catch {
          // Key loss must not prevent local removal; revoke at Google manually.
        }
      }
      await tx.googleOAuthToken.deleteMany({
        where: { integrationAccountId: account.id },
      });
      await tx.integrationAccount.delete({
        where: { id: account.id, ownerId },
      });
      return account.googleToken ? { refresh_token: refreshToken } : null;
    });
  }
}
