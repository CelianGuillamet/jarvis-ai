export const INBOX_ZERO_CATEGORIES = [
  'urgent',
  'quick_wins',
  'schedule',
  'ignore',
  'newsletters',
] as const;

export type InboxZeroCategory = (typeof INBOX_ZERO_CATEGORIES)[number];

export const INBOX_ZERO_STEPS = [
  'urgent',
  'quick_wins',
  'schedule',
  'cleanup',
  'done',
] as const;

export type InboxZeroStep = (typeof INBOX_ZERO_STEPS)[number];

export const INBOX_ZERO_ACTION_TYPES = [
  'archive',
  'mark_read',
  'mark_read_archive',
  'trash',
  'delete',
  'star',
  'remind',
  'draft_reply',
  'send_reply',
  'apply_recommended',
] as const;

export type InboxZeroActionType = (typeof INBOX_ZERO_ACTION_TYPES)[number];

export type InboxZeroItemStatus = 'pending' | 'processed';

export type InboxZeroSessionView = {
  sessionId: string;
  status: 'active' | 'completed';
  step: InboxZeroStep;
  query: string;
  startedAt: string;
  scannedAt: string | null;
  counts: Record<InboxZeroCategory, { pending: number; processed: number }>;
};

export type InboxZeroItemView = {
  id: string;
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  labels: string[];
  gmailCategory: string | null;
  unread: boolean;
  category: InboxZeroCategory;
  priority: number;
  reason: string | null;
  suggested: {
    label: string;
    action: InboxZeroActionType;
  } | null;
  status: InboxZeroItemStatus;
  lastActionAt: string | null;
};

export type InboxZeroActionView = {
  id: string;
  messageId: string | null;
  actionType: InboxZeroActionType;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
};

export type InboxZeroScanResponse = {
  session: InboxZeroSessionView;
  items: InboxZeroItemView[];
  recentActions: InboxZeroActionView[];
};

export type InboxZeroApplyResponse = {
  session: InboxZeroSessionView;
  items: InboxZeroItemView[];
  recentActions: InboxZeroActionView[];
  results: Array<{
    messageId: string;
    ok: boolean;
    error?: string;
  }>;
};

export type InboxZeroDraftReplyResponse = {
  messageId: string;
  subject: string;
  to: string;
  draftText: string;
};

