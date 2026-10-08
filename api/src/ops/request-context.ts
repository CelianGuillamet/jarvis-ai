import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const store = new AsyncLocalStorage<{ requestId: string }>();

export const currentRequestId = () => store.getStore()?.requestId;

/** Inbound identifiers are never trusted: every request gets a fresh opaque ID. */
export function requestIdMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  res.set('X-Request-Id', requestId);
  store.run({ requestId }, next);
}
