export type AuthConfig = {
  baseURL: string;
  appOrigin: string;
  trustedOrigins: string[];
  secret: string;
  secureCookies: boolean;
  google: { clientId: string; clientSecret: string } | undefined;
};

function readOrigin(value: string, production: boolean): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    value !== url.origin ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && loopback && !production))
  ) {
    throw new Error(
      'Authentication origins must be exact HTTPS origins (HTTP loopback is allowed locally).',
    );
  }
  return url.origin;
}

export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const production = env.NODE_ENV === 'production';
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters.');
  }
  const baseURL = readOrigin(
    env.AUTH_BASE_URL ?? 'http://localhost:3000',
    production,
  );
  const webOrigin = readOrigin(
    env.APP_ORIGIN ?? 'http://localhost:5173',
    production,
  );
  const clientId = env.AUTH_GOOGLE_CLIENT_ID;
  const clientSecret = env.AUTH_GOOGLE_CLIENT_SECRET;
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(
      'Both AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET are required together.',
    );
  }
  return {
    baseURL,
    appOrigin: webOrigin,
    trustedOrigins: [...new Set([baseURL, webOrigin])],
    secret,
    secureCookies: baseURL.startsWith('https:'),
    google: clientId && clientSecret ? { clientId, clientSecret } : undefined,
  };
}
