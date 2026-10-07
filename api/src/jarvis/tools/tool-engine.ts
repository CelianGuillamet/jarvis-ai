import { GoogleIntegrationError } from '../../google/google-integration.error';
import {
  hasCalendarRead,
  hasCalendarWrite,
  hasGmailRead,
  hasGmailModify,
  hasGmailPermanentDelete,
  hasGmailSend,
} from '../../google/google-scopes';
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

  if (call.name.startsWith('calendar.')) {
    if (!googleStatus.connected) {
      return new GoogleIntegrationError('GOOGLE_NOT_CONNECTED');
    }

    const isWrite =
      call.name === 'calendar.create' ||
      call.name === 'calendar.update' ||
      call.name === 'calendar.delete';
    const ok = isWrite ? hasCalendarWrite(scopes) : hasCalendarRead(scopes);
    if (!ok) {
      return new GoogleIntegrationError('CALENDAR_SCOPE_MISSING');
    }
  }

  if (call.name.startsWith('gmail.')) {
    if (!googleStatus.connected) {
      return new GoogleIntegrationError('GMAIL_NOT_CONNECTED');
    }

    const isSend = call.name === 'gmail.send';
    const isModify =
      call.name === 'gmail.mark_read' ||
      call.name === 'gmail.bulk_mark_read' ||
      call.name === 'gmail.mark_unread' ||
      call.name === 'gmail.archive' ||
      call.name === 'gmail.unarchive' ||
      call.name === 'gmail.trash' ||
      call.name === 'gmail.untrash' ||
      call.name === 'gmail.delete';
    const ok =
      call.name === 'gmail.delete'
        ? hasGmailPermanentDelete(scopes)
        : isSend
          ? hasGmailSend(scopes)
          : isModify
            ? hasGmailModify(scopes)
            : hasGmailRead(scopes);
    if (!ok) {
      return new GoogleIntegrationError('GMAIL_SCOPE_MISSING');
    }
  }

  return null;
}
