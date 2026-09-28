import { PrismaClient } from '@prisma/client';

const ownedModels = new Set(['Todo', 'Note', 'ShoppingItem', 'CalendarEvent']);
const filteredOperations = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

function object(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid owned query arguments.');
  }
  return value as Record<string, unknown>;
}

function ownedWrite(value: unknown, ownerId: string) {
  const data = object(value);
  // No nested owner writes/connects: ownership is server-supplied and immutable.
  if ('owner' in data || ('ownerId' in data && data.ownerId !== ownerId)) {
    throw new Error('Ownership reassignment is forbidden.');
  }
  return { ...data, ownerId };
}

/** Scope the four account-level domain delegates, including previews and undo.
 * The caller obtains ownerId from a server-owned Conversation, never request data.
 * Other delegates retain their explicit conversation predicates.
 */
export function ownedDomainClient(prisma: PrismaClient, ownerId: string) {
  if (!ownerId) throw new Error('Verified owner required.');
  return prisma.$extends({
    name: 'account-domain-ownership',
    client: { ownerId },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ownedModels.has(model)) return query(args);
          const scoped = { ...args } as Record<string, unknown>;
          if (filteredOperations.has(operation)) {
            scoped.where = { ...object(scoped.where), ownerId };
          }
          if (
            operation === 'create' ||
            operation === 'update' ||
            operation === 'updateMany' ||
            operation === 'updateManyAndReturn'
          ) {
            scoped.data = ownedWrite(scoped.data, ownerId);
          } else if (
            operation === 'createMany' ||
            operation === 'createManyAndReturn'
          ) {
            scoped.data = Array.isArray(scoped.data)
              ? scoped.data.map((row) => ownedWrite(row, ownerId))
              : ownedWrite(scoped.data, ownerId);
          } else if (operation === 'upsert') {
            scoped.create = ownedWrite(scoped.create, ownerId);
            scoped.update = ownedWrite(scoped.update, ownerId);
          } else if (!filteredOperations.has(operation)) {
            throw new Error('Unsupported owned query operation.');
          }
          // The query callback owns the generated per-operation argument type;
          // all runtime modifications above preserve it while enforcing ownerId.
          const result = await query(scoped as typeof args);
          // PostgreSQL's conditional native upsert can return no row when the
          // unique ID belongs to another owner. Never report that as success.
          if (operation === 'upsert' && result === null)
            throw new Error('Owned record unavailable.');
          return result;
        },
      },
    },
  });
}
