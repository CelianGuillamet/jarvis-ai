import { GoogleIntegrationError } from '../../google/google-integration.error';
import type { ToolOnly } from './tool-registry';

export type GoogleConnectionStatus = {
  scopes: string[];
  connected: boolean;
  calendarConnected: boolean;
  gmailConnected: boolean;
};

const FULL_GMAIL_SCOPE = 'https://mail.google.com/';
const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly';
const CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const GMAIL_FULL_SCOPE = 'https://www.googleapis.com/auth/gmail';

function hasAny(scopes: string[], required: string[]) {
  for (const want of required) {
    if (scopes.includes(want)) return true;
  }
  return false;
}

function hasCalendarRead(scopes: string[]) {
  return hasAny(scopes, [
    CALENDAR_READONLY_SCOPE,
    CALENDAR_EVENTS_SCOPE,
    CALENDAR_FULL_SCOPE,
  ]);
}

function hasCalendarWrite(scopes: string[]) {
  return hasAny(scopes, [CALENDAR_EVENTS_SCOPE, CALENDAR_FULL_SCOPE]);
}

function hasGmailRead(scopes: string[]) {
  return hasAny(scopes, [
    FULL_GMAIL_SCOPE,
    GMAIL_READONLY_SCOPE,
    GMAIL_MODIFY_SCOPE,
    GMAIL_SEND_SCOPE,
    GMAIL_COMPOSE_SCOPE,
    GMAIL_FULL_SCOPE,
  ]);
}

function hasGmailModify(scopes: string[]) {
  return hasAny(scopes, [
    FULL_GMAIL_SCOPE,
    GMAIL_MODIFY_SCOPE,
    GMAIL_FULL_SCOPE,
  ]);
}

function hasGmailSend(scopes: string[]) {
  return hasAny(scopes, [
    FULL_GMAIL_SCOPE,
    GMAIL_SEND_SCOPE,
    GMAIL_COMPOSE_SCOPE,
    GMAIL_FULL_SCOPE,
  ]);
}

export function gateToolCall(
  call: ToolOnly,
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
    const ok = isSend
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
