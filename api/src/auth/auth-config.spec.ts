import { readAuthConfig } from './auth-config';

describe('authentication configuration', () => {
  const env = { AUTH_SECRET: 'fixture-secret-with-at-least-32-characters' };
  it('allows loopback HTTP for local work, with no provider credentials', () => {
    expect(readAuthConfig(env)).toMatchObject({
      secureCookies: false,
      google: undefined,
    });
  });
  it('requires a secret and complete provider credentials', () => {
    expect(() => readAuthConfig({})).toThrow('AUTH_SECRET');
    expect(() =>
      readAuthConfig({ ...env, AUTH_GOOGLE_CLIENT_ID: 'partial' }),
    ).toThrow('required together');
  });
  it('rejects origins with paths, credentials, insecure remote hosts or production HTTP', () => {
    for (const origin of [
      'http://remote.invalid',
      'https://app.invalid/path',
      'https://user@app.invalid',
      'https://app.invalid/',
    ]) {
      expect(() => readAuthConfig({ ...env, APP_ORIGIN: origin })).toThrow();
    }
    expect(() => readAuthConfig({ ...env, NODE_ENV: 'production' })).toThrow();
  });
  it('enables secure cookies and explicit origins for HTTPS', () => {
    expect(
      readAuthConfig({
        ...env,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'https://app.invalid',
        APP_ORIGIN: 'https://app.invalid',
      }),
    ).toMatchObject({
      secureCookies: true,
      trustedOrigins: ['https://app.invalid'],
    });
  });
});
