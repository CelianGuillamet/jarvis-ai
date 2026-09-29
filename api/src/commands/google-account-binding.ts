import { ConflictException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export type GoogleAccountBinding = { id: string; providerSubject: string };
const executionAccount = new AsyncLocalStorage<{
  conversationId: string;
  account: GoogleAccountBinding | null;
}>();

export function withGoogleAccountBinding<T>(
  conversationId: string,
  account: GoogleAccountBinding | null,
  work: () => Promise<T>,
): Promise<T> {
  return executionAccount.run(
    { conversationId, account: account ? { ...account } : null },
    work,
  );
}

/** Checked on every credential load, including later steps in a compound action. */
export function assertBoundGoogleAccount(
  conversationId: string,
  current: GoogleAccountBinding | null,
) {
  const bound = executionAccount.getStore();
  if (!bound) return;
  if (bound.conversationId !== conversationId)
    throw new ConflictException('Conversation de commande invalide.');
  assertSameGoogleAccount(bound.account, current);
}
export const usesGoogleAccount = (name: string) =>
  /^(gmail|calendar)\./.test(name);

export function loadGoogleAccount(
  prisma: Pick<PrismaService, 'integrationAccount'>,
  ownerId: string,
) {
  return prisma.integrationAccount.findUnique({
    where: { ownerId_provider: { ownerId, provider: 'google' } },
    select: { id: true, providerSubject: true },
  });
}

export function assertSameGoogleAccount(
  expected: GoogleAccountBinding | null | undefined,
  current: GoogleAccountBinding | null,
  allowMissing = false,
) {
  if (allowMissing && expected === null && current === null) return;
  if (
    !expected ||
    !current ||
    expected.id !== current.id ||
    expected.providerSubject !== current.providerSubject
  ) {
    throw new ConflictException(
      'Le compte Google a changé. Propose à nouveau cette action.',
    );
  }
}

export function googleAccountTarget(
  account: GoogleAccountBinding | null,
): Prisma.InputJsonObject {
  return {
    kind: 'google-account',
    id: account?.id ?? null,
    providerSubject: account?.providerSubject ?? null,
  };
}

export function splitCommandTargets(value: Prisma.JsonValue) {
  if (!Array.isArray(value))
    throw new ConflictException('Cibles de commande invalides.');
  let googleAccount: GoogleAccountBinding | null | undefined;
  const targets: Prisma.JsonArray = [];
  for (const row of value) {
    if (
      row &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      row.kind === 'google-account'
    ) {
      if (googleAccount !== undefined)
        throw new ConflictException('Compte de commande ambigu.');
      if (row.id === null && row.providerSubject === null) googleAccount = null;
      else if (
        typeof row.id === 'string' &&
        row.id &&
        typeof row.providerSubject === 'string' &&
        row.providerSubject
      ) {
        googleAccount = { id: row.id, providerSubject: row.providerSubject };
      } else throw new ConflictException('Compte de commande invalide.');
    } else targets.push(row);
  }
  return { targets, googleAccount };
}
