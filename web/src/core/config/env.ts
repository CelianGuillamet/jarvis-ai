function readString(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export const env = {
  apiBaseUrl: readString(import.meta.env.VITE_API_BASE_URL),
  defaultSessionId: readString(import.meta.env.VITE_DEFAULT_SESSION_ID) || 'default',
  requestTimeoutMs: readNumber(import.meta.env.VITE_REQUEST_TIMEOUT_MS, 60_000),
};

