/** Deployment-independent admission policy, also used when sessions are revalidated. */
export type AccountAdmission = {
  email: string;
  emailVerified: boolean;
  disabled: boolean;
};

export type InviteAdmission = {
  email: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAccountAdmitted(
  account: AccountAdmission,
  invite: InviteAdmission | null,
  now = new Date(),
): boolean {
  return (
    account.emailVerified &&
    !account.disabled &&
    invite !== null &&
    normalizeAccountEmail(invite.email) ===
      normalizeAccountEmail(account.email) &&
    invite.revokedAt === null &&
    (invite.expiresAt === null || invite.expiresAt.getTime() > now.getTime())
  );
}

/** Cookie-authenticated mutations require an exact configured browser origin. */
export function isTrustedMutationOrigin(
  origin: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  if (!origin || origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && trustedOrigins.includes(origin);
  } catch {
    return false;
  }
}
