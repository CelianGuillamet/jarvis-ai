import { validateRuntimeConfig } from './runtime-config';

const valid = {
  DATABASE_URL: 'postgresql://fixture:fixture@localhost:5432/test',
  AUTH_SECRET: 'fixture-secret-with-at-least-32-characters',
};

describe('runtime configuration', () => {
  it('accepts local defaults and the actual brief verbosity contract', () => {
    expect(
      validateRuntimeConfig({ ...valid, JARVIS_DEFAULT_VERBOSITY: 'brief' }),
    ).toMatchObject({ PORT: '3000', LLM_PROVIDER: 'ollama' });
  });
  it.each([
    { DATABASE_URL: '' },
    { AUTH_SECRET: 'short' },
    { PORT: '3000oops' },
    { SIMULATION: 'yes' },
    { LLM_PROVIDER: 'other' },
    { JARVIS_TZ: 'invalid-zone' },
    { LLM_PROVIDER: 'openai' },
    { GOOGLE_CLIENT_ID: 'incomplete' },
    { NODE_ENV: 'production' },
    { OPENAI_BASE_URL: 'https://user:password@example.com/' },
  ])('rejects invalid settings %j', (input) => {
    expect(() => validateRuntimeConfig({ ...valid, ...input })).toThrow(
      'Invalid runtime configuration',
    );
  });
  it('never includes rejected secret-bearing values in diagnostics', () => {
    try {
      validateRuntimeConfig({
        ...valid,
        DATABASE_URL: 'sensitive-db-value',
        AUTH_BASE_URL: 'sensitive-auth-value',
      });
    } catch (error) {
      expect(String(error)).toContain('DATABASE_URL');
      expect(String(error)).not.toContain('sensitive-');
      return;
    }
    throw new Error('Expected rejection');
  });
  it('requires exact HTTPS production origins', () => {
    expect(
      validateRuntimeConfig({
        ...valid,
        NODE_ENV: 'production',
        AUTH_BASE_URL: 'https://api.example.invalid',
        APP_ORIGIN: 'https://app.example.invalid',
      }).NODE_ENV,
    ).toBe('production');
  });
});
