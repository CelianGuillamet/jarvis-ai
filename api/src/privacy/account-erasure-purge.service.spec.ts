import { ERASURE_DELETE_ORDER } from './account-erasure-purge.service';
import { RETAINED_DATA_INVENTORY } from './data-inventory';

describe('Erasure inventory', () => {
  it('covers every model with deletion or an explicit retained-data treatment', () => {
    const special = [
      'AccountErasureJob', // Opaque receipt and backup tombstone, expires separately.
      'LegacyOwnershipBatch', // Shared manifest is scrubbed per owner.
      'Verification', // No owner relation: expire independently, never guess an owner.
    ];
    expect([...ERASURE_DELETE_ORDER, ...special].sort()).toEqual(
      Object.keys(RETAINED_DATA_INVENTORY).sort(),
    );
    expect(new Set(ERASURE_DELETE_ORDER).size).toBe(
      ERASURE_DELETE_ORDER.length,
    );
  });

  it('deletes referenced children before their parents and identity last', () => {
    const ordered = ERASURE_DELETE_ORDER as readonly string[];
    for (const [child, parent] of [
      ['HabitLog', 'Habit'],
      ['CommandTransition', 'Command'],
      ['CommandCompensation', 'Command'],
      ['ConversationTurn', 'Command'],
      ['Command', 'Conversation'],
      ['InboxReplyDraft', 'Conversation'],
      ['InboxReplyOperation', 'Conversation'],
      ['GoogleOAuthToken', 'IntegrationAccount'],
      ['LegacyOwnershipRecord', 'User'],
      ['BetaInvite', 'User'],
    ]) {
      expect(ordered.indexOf(child)).toBeLessThan(ordered.indexOf(parent));
    }
    expect(ordered.at(-1)).toBe('User');
  });
});
