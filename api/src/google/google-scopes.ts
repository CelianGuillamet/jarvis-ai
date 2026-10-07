export const GOOGLE_AUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
] as const;

const AUTH = 'https://www.googleapis.com/auth/';

export function hasCalendarRead(scopes: string[]) {
  const hasCalendarList = [
    'calendar',
    'calendar.readonly',
    'calendar.calendarlist',
    'calendar.calendarlist.readonly',
  ].some((scope) => scopes.includes(`${AUTH}${scope}`));
  const hasEvents = [
    'calendar',
    'calendar.readonly',
    'calendar.events',
    'calendar.events.readonly',
  ].some((scope) => scopes.includes(`${AUTH}${scope}`));
  return hasCalendarList && hasEvents;
}

export function hasCalendarWrite(scopes: string[]) {
  return ['calendar', 'calendar.events'].some((scope) =>
    scopes.includes(`${AUTH}${scope}`),
  );
}

export function hasGmailRead(scopes: string[]) {
  return (
    ['gmail.readonly', 'gmail.modify', 'gmail.compose'].some((scope) =>
      scopes.includes(`${AUTH}${scope}`),
    ) || scopes.includes('https://mail.google.com/')
  );
}

export function hasGmailModify(scopes: string[]) {
  return (
    scopes.includes(`${AUTH}gmail.modify`) ||
    scopes.includes('https://mail.google.com/')
  );
}

export function hasGmailSend(scopes: string[]) {
  return (
    ['gmail.modify', 'gmail.send', 'gmail.compose'].some((scope) =>
      scopes.includes(`${AUTH}${scope}`),
    ) || scopes.includes('https://mail.google.com/')
  );
}

export function hasGmailPermanentDelete(scopes: string[]) {
  return scopes.includes('https://mail.google.com/');
}

export function parseGoogleScopes(scopeText: string | null | undefined) {
  return (scopeText || '')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

export function buildGoogleConnectionStatus(
  scopeText: string | null | undefined,
) {
  const scopes = parseGoogleScopes(scopeText);

  return {
    scopes,
    connected: scopes.length > 0,
    calendarConnected: hasCalendarRead(scopes),
    gmailConnected: hasGmailRead(scopes),
  };
}
