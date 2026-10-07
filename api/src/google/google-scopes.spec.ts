import {
  buildGoogleConnectionStatus,
  GOOGLE_AUTH_SCOPES,
} from './google-scopes';

describe('Google integration scopes', () => {
  it('requests only permissions used by the supported calendar and inbox flows', () => {
    expect(GOOGLE_AUTH_SCOPES).toEqual([
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.modify',
    ]);
  });

  it('reports only usable capabilities from exact granted scopes', () => {
    const list =
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
    const events = 'https://www.googleapis.com/auth/calendar.events';
    const modify = 'https://www.googleapis.com/auth/gmail.modify';
    expect(
      buildGoogleConnectionStatus(`${list} ${events} ${modify}`),
    ).toMatchObject({
      connected: true,
      calendarConnected: true,
      gmailConnected: true,
    });
    expect(
      buildGoogleConnectionStatus(
        `${events} https://example.com/auth/gmail.modify`,
      ),
    ).toMatchObject({
      connected: true,
      calendarConnected: false,
      gmailConnected: false,
    });
  });

  it.each([
    ['gmail.send', false],
    ['gmail.compose', false],
    ['gmail.metadata', false],
    ['gmail.labels', false],
    ['gmail.readonly', true],
    ['gmail.modify', true],
  ])('reports inbox access for %s as %s', (scope, gmailConnected) => {
    expect(
      buildGoogleConnectionStatus(`https://www.googleapis.com/auth/${scope}`),
    ).toMatchObject({ connected: true, gmailConnected });
  });

  it.each([null, undefined, '', ' \t\n '])(
    'reports no capabilities for an absent grant (%s)',
    (scopeText) => {
      expect(buildGoogleConnectionStatus(scopeText)).toEqual({
        scopes: [],
        connected: false,
        calendarConnected: false,
        gmailConnected: false,
      });
    },
  );
});
