import { readAuthConfig } from '../auth/auth-config';
import { TokenCipher } from '../google/token-cipher';

export class RuntimeConfigurationError extends Error {
  constructor(fields: string[]) {
    super(`Invalid runtime configuration: ${[...new Set(fields)].join(', ')}.`);
    this.name = 'RuntimeConfigurationError';
  }
}

/** Validate before opening listeners. Diagnostics name fields, never their values. */
export function validateRuntimeConfig(input: Record<string, unknown>) {
  const env: NodeJS.ProcessEnv = {};
  const errors: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') env[key] = value;
    else if (value !== undefined) errors.push(key);
  }
  const enumeration = (key: string, values: string[], fallback?: string) => {
    if (!env[key] && fallback) env[key] = fallback;
    if (env[key] !== undefined && !values.includes(env[key])) errors.push(key);
  };
  const integer = (
    key: string,
    min: number,
    max: number,
    fallback?: number,
  ) => {
    if (env[key] === undefined && fallback !== undefined)
      env[key] = String(fallback);
    const value = env[key];
    if (
      value !== undefined &&
      (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)
    )
      errors.push(key);
  };
  const httpUrl = (key: string) => {
    if (!env[key]) return;
    try {
      const url = new URL(env[key]);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      )
        errors.push(key);
    } catch {
      errors.push(key);
    }
  };
  enumeration('PRIVACY_WORKER_ENABLED', ['true', 'false'], 'true');
  enumeration('NODE_ENV', ['development', 'test', 'production'], 'development');
  enumeration('LLM_PROVIDER', ['ollama', 'openai'], 'ollama');
  enumeration('JARVIS_DEFAULT_SPEECH_MODE', ['tu', 'vous']);
  enumeration('JARVIS_DEFAULT_VERBOSITY', ['brief', 'normal', 'detailed']);
  for (const key of [
    'SIMULATION',
    'ALLOW_DEFAULT_SESSION',
    'REQUIRE_CONFIRM_SESSION_MATCH',
    'HUMANIZE_RESPONSES',
    'HUMAN_PROFILE_PERSIST',
    'WEB_AUTO_OPEN_RESULTS',
  ])
    enumeration(key, ['true', 'false']);
  integer('PORT', 1, 65535, 3000);
  for (const key of [
    'PENDING_TTL_MINUTES',
    'CONVO_TTL_MINUTES',
    'JARVIS_MEMORY_TTL_MINUTES',
    'HUMAN_PROFILE_TTL_MINUTES',
    'JARVIS_WORKFLOW_LOOKBACK_MINUTES',
  ])
    integer(key, 1, 10080);
  for (const key of [
    'CONVO_MAX_SESSIONS',
    'JARVIS_MEMORY_MAX_SESSIONS',
    'HUMAN_PROFILE_MAX_SESSIONS',
  ])
    integer(key, 1, 10000);
  integer('JARVIS_MEMORY_MAX_TURNS', 1, 100);
  integer('JARVIS_MEMORY_MAX_CHARS', 1, 20000);
  integer('JARVIS_WORLD_MODEL_FACTS_PER_LAYER', 1, 20);
  integer('WEB_AUTO_OPEN_MAX', 0, 5);
  integer('WEB_AUTO_OPEN_MAX_CHARS', 1, 20000);
  for (const key of [
    'OPENAI_TIMEOUT_MS',
    'WEATHER_TIMEOUT_MS',
    'HUMAN_PROFILE_FLUSH_INTERVAL_MS',
    'HUMAN_PROFILE_MIN_PERSIST_INTERVAL_MS',
  ])
    integer(key, 100, 300000);
  try {
    const db = new URL(env.DATABASE_URL ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(db.protocol) ||
      !db.hostname ||
      db.pathname.length < 2
    )
      errors.push('DATABASE_URL');
  } catch {
    errors.push('DATABASE_URL');
  }
  try {
    readAuthConfig(env);
  } catch {
    errors.push(
      'AUTH_SECRET / AUTH_BASE_URL / APP_ORIGIN / AUTH_GOOGLE_CLIENT_ID / AUTH_GOOGLE_CLIENT_SECRET',
    );
  }
  const googleConfigured = !!(env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET);
  if (googleConfigured) {
    if (
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET ||
      !env.GOOGLE_REDIRECT_URI
    )
      errors.push(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI',
      );
    try {
      new TokenCipher(
        env.GOOGLE_TOKEN_KEYS ?? '{}',
        env.GOOGLE_TOKEN_ACTIVE_KEY ?? '',
      );
    } catch {
      errors.push('GOOGLE_TOKEN_KEYS / GOOGLE_TOKEN_ACTIVE_KEY');
    }
  }
  for (const key of [
    'GOOGLE_REDIRECT_URI',
    'OLLAMA_URL',
    'OPENAI_BASE_URL',
    'WEATHER_GEO_BASE_URL',
    'WEATHER_BASE_URL',
  ])
    httpUrl(key);
  if (
    env.NODE_ENV === 'production' &&
    env.GOOGLE_REDIRECT_URI &&
    !env.GOOGLE_REDIRECT_URI.startsWith('https://')
  )
    errors.push('GOOGLE_REDIRECT_URI');
  if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY?.trim())
    errors.push('OPENAI_API_KEY');
  if (env.JARVIS_TZ) {
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: env.JARVIS_TZ });
    } catch {
      errors.push('JARVIS_TZ');
    }
  }
  if (errors.length) throw new RuntimeConfigurationError(errors);
  return env;
}
