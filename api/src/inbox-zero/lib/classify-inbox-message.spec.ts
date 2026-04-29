import type { GmailMessageItem } from '../../gmail/providers/gmail.provider';
import { classifyInboxMessage } from './classify-inbox-message';

function base(overrides: Partial<GmailMessageItem> = {}): GmailMessageItem {
  return {
    id: 'm1',
    threadId: 't1',
    subject: 'Sujet',
    from: 'sender@example.com',
    to: 'me@example.com',
    date: new Date('2026-04-19T10:00:00+02:00'),
    snippet: 'Extrait',
    labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
    category: 'primary',
    unread: true,
    ...overrides,
  };
}

describe('classifyInboxMessage', () => {
  it('classifies promotions as newsletters', () => {
    const out = classifyInboxMessage(
      base({ category: 'promotions', subject: 'Promo -40%' }),
    );
    expect(out.category).toBe('newsletters');
    expect(out.suggested?.action).toBe('mark_read_archive');
  });

  it('detects scheduling intent', () => {
    const out = classifyInboxMessage(
      base({ subject: 'Dispo pour un call ? Calendly', snippet: 'Choisis un créneau' }),
    );
    expect(out.category).toBe('schedule');
    expect(out.suggested?.action).toBe('remind');
  });

  it('detects urgent intent', () => {
    const out = classifyInboxMessage(
      base({ subject: 'URGENT: action requise aujourd’hui', snippet: 'deadline' }),
    );
    expect(out.category).toBe('urgent');
    expect(out.suggested?.action).toBe('draft_reply');
  });

  it('maps social/forums to ignore', () => {
    const out = classifyInboxMessage(base({ category: 'social' }));
    expect(out.category).toBe('ignore');
  });

  it('defaults to quick wins', () => {
    const out = classifyInboxMessage(base({ subject: 'Petite question', snippet: 'Hello' }));
    expect(out.category).toBe('quick_wins');
    expect(out.suggested?.action).toBe('mark_read_archive');
  });
});

