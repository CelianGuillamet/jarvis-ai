export type InboxZeroCategory =
  | 'urgent'
  | 'quick_wins'
  | 'schedule'
  | 'ignore'
  | 'newsletters';

export type InboxZeroStep = 'urgent' | 'quick_wins' | 'schedule' | 'cleanup' | 'done';

export type InboxZeroActionType =
  | 'archive'
  | 'mark_read'
  | 'mark_read_archive'
  | 'trash'
  | 'delete'
  | 'star'
  | 'remind'
  | 'draft_reply'
  | 'send_reply'
  | 'apply_recommended';

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
  status: 'pending' | 'processed';
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

export type InboxZeroApplyResponse = InboxZeroScanResponse & {
  results: Array<{
    messageId: string;
    ok: boolean;
    error?: string;
  }>;
};

export type GmailMessageDetail = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string | Date;
  snippet: string;
  labels: string[];
  unread: boolean;
  bodyText: string;
  bodyHtml?: string | null;
  messageIdHeader?: string | null;
  referencesHeader?: string | null;
};

export type InboxZeroMessageResponse = {
  item: InboxZeroItemView | null;
  message: GmailMessageDetail;
};

export type InboxZeroDraftReplyResponse = {
  messageId: string;
  subject: string;
  to: string;
  draftText: string;
};

