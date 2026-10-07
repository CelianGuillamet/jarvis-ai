import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RETAINED_DATA_INVENTORY } from './data-inventory';

describe('Retained-data coverage', () => {
  it('requires an explicit privacy disposition for every database model', () => {
    const schema = readFileSync(
      join(process.cwd(), 'prisma/schema.prisma'),
      'utf8',
    );
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map(
      (match) => match[1],
    );
    expect(Object.keys(RETAINED_DATA_INVENTORY).sort()).toEqual(models.sort());
  });
  it('never exports OAuth credentials or verification secrets', () => {
    for (const model of [
      'GoogleOAuthToken',
      'GoogleOAuthState',
      'Verification',
    ] as const) {
      expect(RETAINED_DATA_INVENTORY[model].export).toBe('excluded');
    }
    expect(RETAINED_DATA_INVENTORY.Session.export).toBe('metadata');
    expect(RETAINED_DATA_INVENTORY.Account.export).toBe('metadata');
  });
  it('includes ownership migration copies in the erasure inventory', () => {
    expect(RETAINED_DATA_INVENTORY.LegacyOwnershipRecord.scope).toBe(
      'migration-owner',
    );
    expect(RETAINED_DATA_INVENTORY.LegacyOwnershipBatch.scope).toBe(
      'migration-manifest',
    );
  });
});
