import type { GmailCategory } from '../gmail-category';

export type GmailMessageItem = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  snippet: string;
  labels: string[];
  category?: GmailCategory | null;
  unread: boolean;
};

export type GmailMessageDetail = GmailMessageItem & {
  bodyText: string;
  bodyHtml?: string | null;
  messageIdHeader?: string | null;
  referencesHeader?: string | null;
};

export interface GmailProvider {
  listMessages(
    sessionId: string,
    options?: {
      q?: string;
      labelIds?: string[];
      maxResults?: number;
    },
  ): Promise<GmailMessageItem[]>;

  getMessage(sessionId: string, messageId: string): Promise<GmailMessageDetail>;

  modifyLabels(
    sessionId: string,
    messageId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[],
  ): Promise<void>;

  trashMessage(sessionId: string, messageId: string): Promise<void>;

  untrashMessage(sessionId: string, messageId: string): Promise<void>;

  deleteMessage(sessionId: string, messageId: string): Promise<void>;

  sendMessage(
    sessionId: string,
    payload: {
      to: string;
      subject: string;
      text: string;
      cc?: string;
      bcc?: string;
      threadId?: string;
      inReplyTo?: string;
      references?: string;
    },
  ): Promise<void>;
}
