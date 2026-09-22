import { isAccountAdmitted, isTrustedMutationOrigin } from './auth-policy';

describe('account admission policy', () => {
  const now = new Date('2026-09-22T00:00:00Z');
  const account = {
    email: 'Invited@Example.invalid',
    emailVerified: true,
    disabled: false,
  };
  const invite = {
    email: 'invited@example.invalid',
    expiresAt: null,
    revokedAt: null,
  };

  it('admits a verified invited account with normalized email', () => {
    expect(isAccountAdmitted(account, invite, now)).toBe(true);
  });

  it('denies uninvited, unverified, disabled and mismatched accounts', () => {
    expect(isAccountAdmitted(account, null, now)).toBe(false);
    expect(
      isAccountAdmitted({ ...account, emailVerified: false }, invite, now),
    ).toBe(false);
    expect(isAccountAdmitted({ ...account, disabled: true }, invite, now)).toBe(
      false,
    );
    expect(
      isAccountAdmitted(
        { ...account, email: 'other@example.invalid' },
        invite,
        now,
      ),
    ).toBe(false);
  });

  it('denies revoked invites and expiration at the boundary', () => {
    expect(isAccountAdmitted(account, { ...invite, revokedAt: now }, now)).toBe(
      false,
    );
    expect(isAccountAdmitted(account, { ...invite, expiresAt: now }, now)).toBe(
      false,
    );
    expect(
      isAccountAdmitted(
        account,
        { ...invite, expiresAt: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe(true);
  });
});

describe('mutation origin policy', () => {
  const trusted = ['http://localhost:5173', 'https://jarvis.example.invalid'];
  it('accepts only exact configured origins', () => {
    expect(isTrustedMutationOrigin(trusted[0], trusted)).toBe(true);
    expect(isTrustedMutationOrigin(trusted[1], trusted)).toBe(true);
    for (const origin of [
      undefined,
      'null',
      'https://evil.invalid',
      'https://jarvis.example.invalid.evil.invalid',
      'https://jarvis.example.invalid/path',
      'https://user@jarvis.example.invalid',
      'http://localhost:5174',
    ]) {
      expect(isTrustedMutationOrigin(origin, trusted)).toBe(false);
    }
  });
});
