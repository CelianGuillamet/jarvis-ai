export const GOOGLE_AUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
] as const;

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
    calendarConnected: scopes.some((scope) => scope.includes('/auth/calendar')),
    gmailConnected: scopes.some((scope) => scope.includes('/auth/gmail')),
  };
}
