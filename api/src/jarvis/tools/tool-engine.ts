import { GoogleIntegrationError } from '../../google/google-integration.error';
import {
  hasCalendarRead,
  hasCalendarWrite,
  hasGmailRead,
  hasGmailModify,
  hasGmailPermanentDelete,
  hasGmailSend,
} from '../../google/google-scopes';
import { TOOL_DEFINITIONS } from './tool-definitions';
import type { ToolOnly } from './tool-registry';

export type GoogleConnectionStatus = {
  scopes: string[];
  connected: boolean;
  calendarConnected: boolean;
  gmailConnected: boolean;
};

export function gateToolCall(
  call: Pick<ToolOnly, 'name'>,
  googleStatus: GoogleConnectionStatus,
): GoogleIntegrationError | null {
  const scopes = googleStatus.scopes ?? [];
  const requirement = TOOL_DEFINITIONS[call.name]?.requires ?? 'none';

  if (requirement.startsWith('calendar.')) {
    if (!googleStatus.connected) {
      return new GoogleIntegrationError('GOOGLE_NOT_CONNECTED');
    }
    const ok =
      requirement === 'calendar.write'
        ? hasCalendarWrite(scopes)
        : hasCalendarRead(scopes);
    if (!ok) {
      return new GoogleIntegrationError('CALENDAR_SCOPE_MISSING');
    }
  }

  if (requirement.startsWith('gmail.')) {
    if (!googleStatus.connected) {
      return new GoogleIntegrationError('GMAIL_NOT_CONNECTED');
    }
    const ok =
      requirement === 'gmail.permanent_delete'
        ? hasGmailPermanentDelete(scopes)
        : requirement === 'gmail.send'
          ? hasGmailSend(scopes)
          : requirement === 'gmail.modify'
            ? hasGmailModify(scopes)
            : hasGmailRead(scopes);
    if (!ok) {
      return new GoogleIntegrationError('GMAIL_SCOPE_MISSING');
    }
  }

  return null;
}
