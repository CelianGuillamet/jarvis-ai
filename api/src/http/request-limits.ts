export { REQUEST_LIMITS } from '../contracts/v1';

export const REQUEST_QUOTAS = {
  windowMs: 60_000,
  account: 120,
  costly: 20,
  authAddress: 30,
  maxEntries: 10000,
} as const;
