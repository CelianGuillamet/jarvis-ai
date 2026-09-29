export const REQUEST_LIMITS = {
  bodyBytes: 64 * 1024,
  urlBytes: 8192,
  sessionChars: 128,
  objectIdChars: 256,
  queryChars: 500,
  chatChars: 8000,
  replyChars: 20000,
  batchItems: 20,
} as const;

export const REQUEST_QUOTAS = {
  windowMs: 60_000,
  account: 120,
  costly: 20,
  authAddress: 30,
  maxEntries: 10000,
} as const;
