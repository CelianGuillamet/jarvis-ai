import { gateToolCall } from './tool-engine';
import type { ToolOnly } from './tool-registry';

function status(scopes: string[]) {
  const connected = scopes.length > 0;
  return {
    scopes,
    connected,
    calendarConnected: scopes.some((s) => s.includes('/auth/calendar')),
    gmailConnected: scopes.some((s) => s.includes('/auth/gmail')),
  };
}

describe('gateToolCall', () => {
  it('blocks gmail tools when no Google token is connected', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.list',
      args: { limit: 20 },
    };
    const err = gateToolCall(call, status([]));
    expect(err?.code).toBe('GMAIL_NOT_CONNECTED');
  });

  it('allows gmail.list with gmail.readonly scope', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.list',
      args: { limit: 20 },
    };
    const err = gateToolCall(
      call,
      status(['https://www.googleapis.com/auth/gmail.readonly']),
    );
    expect(err).toBeNull();
  });

  it('blocks gmail.send when send scopes are missing', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.send',
      args: { to: 'a@example.com', subject: 'x', text: 'y' },
    };
    const err = gateToolCall(
      call,
      status(['https://www.googleapis.com/auth/gmail.readonly']),
    );
    expect(err?.code).toBe('GMAIL_SCOPE_MISSING');
  });

  it('blocks gmail.bulk_mark_read when modify scopes are missing', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.bulk_mark_read',
      args: { refs: [1, 2] },
    };
    const err = gateToolCall(
      call,
      status(['https://www.googleapis.com/auth/gmail.readonly']),
    );
    expect(err?.code).toBe('GMAIL_SCOPE_MISSING');
  });

  it('allows gmail.bulk_mark_read with gmail.modify scope', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.bulk_mark_read',
      args: { refs: [1, 2] },
    };
    const err = gateToolCall(
      call,
      status(['https://www.googleapis.com/auth/gmail.modify']),
    );
    expect(err).toBeNull();
  });

  it('allows gmail.send with gmail.modify scope', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.send',
      args: { to: 'a@example.com', subject: 'x', text: 'y' },
    };
    expect(
      gateToolCall(
        call,
        status(['https://www.googleapis.com/auth/gmail.modify']),
      ),
    ).toBeNull();
  });

  it.each(['gmail.send', 'gmail.compose'])(
    'allows sending but not inbox reads with %s consent',
    (scope) => {
      const call: ToolOnly = {
        type: 'tool',
        name: 'gmail.list',
        args: { limit: 20 },
      };
      expect(
        gateToolCall(call, status([`https://www.googleapis.com/auth/${scope}`]))
          ?.code,
      ).toBe('GMAIL_SCOPE_MISSING');
      expect(
        gateToolCall(
          { name: 'gmail.send' },
          status([`https://www.googleapis.com/auth/${scope}`]),
        ),
      ).toBeNull();
    },
  );

  it('does not authorize permanent deletion with gmail.modify', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'gmail.delete',
      args: { ref: 1 },
    };
    expect(
      gateToolCall(
        call,
        status(['https://www.googleapis.com/auth/gmail.modify']),
      )?.code,
    ).toBe('GMAIL_SCOPE_MISSING');
  });

  it('blocks calendar.create when calendar.events scope is missing', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'calendar.create',
      args: { title: 'Demo', when: '2026-04-17T18:00:00+02:00' },
    };
    const err = gateToolCall(
      call,
      status(['https://www.googleapis.com/auth/calendar.readonly']),
    );
    expect(err?.code).toBe('CALENDAR_SCOPE_MISSING');
  });

  it('allows calendar.list with calendar.readonly scope', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'calendar.list',
      args: { rangeText: "aujourd'hui", limit: 20 },
    };
    const err = gateToolCall(
      call,
      status(['https://www.googleapis.com/auth/calendar.readonly']),
    );
    expect(err).toBeNull();
  });

  it('requires both calendar-list and event-read permissions to list events', () => {
    const call: ToolOnly = {
      type: 'tool',
      name: 'calendar.list',
      args: { rangeText: "aujourd'hui", limit: 20 },
    };
    const listScope =
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
    const eventScope = 'https://www.googleapis.com/auth/calendar.events';
    expect(gateToolCall(call, status([listScope]))?.code).toBe(
      'CALENDAR_SCOPE_MISSING',
    );
    expect(gateToolCall(call, status([eventScope]))?.code).toBe(
      'CALENDAR_SCOPE_MISSING',
    );
    expect(gateToolCall(call, status([listScope, eventScope]))).toBeNull();
  });
});
