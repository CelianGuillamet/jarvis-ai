export const GOOGLE_INTEGRATION_ERROR_CODES = [
  'GOOGLE_OAUTH_CONFIG_MISSING',
  'GOOGLE_NOT_CONNECTED',
  'CALENDAR_SCOPE_MISSING',
  'GMAIL_NOT_CONNECTED',
  'GMAIL_SCOPE_MISSING',
] as const;

export type GoogleIntegrationErrorCode =
  (typeof GOOGLE_INTEGRATION_ERROR_CODES)[number];

function isGoogleIntegrationErrorCode(
  value: string,
): value is GoogleIntegrationErrorCode {
  return GOOGLE_INTEGRATION_ERROR_CODES.includes(
    value as GoogleIntegrationErrorCode,
  );
}

export class GoogleIntegrationError extends Error {
  constructor(
    readonly code: GoogleIntegrationErrorCode,
    readonly details?: string,
  ) {
    super(details ? `${code}:${details}` : code);
    this.name = 'GoogleIntegrationError';
  }
}

export function asGoogleIntegrationError(
  error: unknown,
): GoogleIntegrationError | null {
  if (error instanceof GoogleIntegrationError) return error;
  if (!(error instanceof Error)) return null;

  const [rawCode, ...detailsParts] = error.message.split(':');
  if (!isGoogleIntegrationErrorCode(rawCode)) return null;

  const details =
    detailsParts.length > 0 ? detailsParts.join(':').trim() : undefined;
  return new GoogleIntegrationError(rawCode, details || undefined);
}
