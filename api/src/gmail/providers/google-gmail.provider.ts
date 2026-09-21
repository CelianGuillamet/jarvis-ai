import { google } from 'googleapis';

import { GoogleOAuthClientService } from '../../google/google-oauth-client.service';
import { GoogleIntegrationError } from '../../google/google-integration.error';
import { getGmailCategoryFromLabels } from '../gmail-category';
import type {
  GmailMessageDetail,
  GmailMessageItem,
  GmailProvider,
} from './gmail.provider';

type Header = {
  name?: string | null;
  value?: string | null;
};

type MessagePart = {
  mimeType?: string | null;
  body?: {
    data?: string | null;
  } | null;
  parts?: MessagePart[] | null;
};

type GoogleApiErrorLike = {
  code?: number;
  message?: string;
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
      };
    };
  };
};

function decodeBase64Url(value: string | undefined | null) {
  if (!value) return '';
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const full =
    padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
  return Buffer.from(full, 'base64').toString('utf-8');
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function headerValue(headers: Header[] | undefined, wantedName: string) {
  if (!headers?.length) return '';
  const found = headers.find(
    (header) => (header.name || '').toLowerCase() === wantedName.toLowerCase(),
  );
  return (found?.value || '').trim();
}

function extractBodies(part: MessagePart | undefined): {
  text: string;
  html: string | null;
} {
  if (!part) return { text: '', html: null };

  const textChunks: string[] = [];
  const htmlChunks: string[] = [];

  const visit = (node: MessagePart) => {
    const mime = (node.mimeType || '').toLowerCase();
    const data = decodeBase64Url(node.body?.data);
    if (data) {
      if (mime.includes('text/plain')) textChunks.push(data);
      else if (mime.includes('text/html')) htmlChunks.push(data);
    }
    for (const child of node.parts || []) visit(child);
  };

  visit(part);

  const text = textChunks.join('\n').replace(/\0/g, '').trim();
  const html = htmlChunks.join('\n').replace(/\0/g, '').trim() || null;
  return { text, html };
}

function cleanBodyText(raw: string) {
  return raw
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function extractGoogleApiError(error: unknown) {
  const googleError =
    typeof error === 'object' && error !== null
      ? (error as GoogleApiErrorLike)
      : null;
  const body = googleError?.response?.data;
  return {
    code: googleError?.code ?? googleError?.response?.status,
    message: body?.error?.message || googleError?.message || String(error),
  };
}

function isGmailScopeMissingError(error: unknown) {
  const { code, message } = extractGoogleApiError(error);
  return (
    code === 403 &&
    /insufficient permissions|request had insufficient authentication scopes/i.test(
      message,
    )
  );
}

export class GoogleGmailProvider implements GmailProvider {
  constructor(private readonly googleOAuth: GoogleOAuthClientService) {}

  private async authedGmail(sessionId: string) {
    const oauth2 = await this.googleOAuth.createAuthorizedClient(
      sessionId,
      'GMAIL_NOT_CONNECTED',
    );
    return google.gmail({ version: 'v1', auth: oauth2 });
  }

  private async withScopeGuard<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (isGmailScopeMissingError(error)) {
        const { message } = extractGoogleApiError(error);
        throw new GoogleIntegrationError('GMAIL_SCOPE_MISSING', message);
      }
      throw error;
    }
  }

  private async messageMetadata(
    sessionId: string,
    messageId: string,
  ): Promise<GmailMessageItem> {
    const gmail = await this.authedGmail(sessionId);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date'],
    });
    const data = res.data;
    const headers = (data.payload?.headers || []) as Header[];
    const dateHeader = headerValue(headers, 'Date');
    const parsedDate = Date.parse(dateHeader);
    const internalDate = Number(data.internalDate || 0);
    const date =
      Number.isFinite(parsedDate) && parsedDate > 0
        ? new Date(parsedDate)
        : internalDate > 0
          ? new Date(internalDate)
          : new Date();
    const labels = data.labelIds || [];

    return {
      id: data.id || messageId,
      threadId: data.threadId || '',
      subject: headerValue(headers, 'Subject') || '(Sans objet)',
      from: headerValue(headers, 'From') || '(Expediteur inconnu)',
      to: headerValue(headers, 'To') || '',
      date,
      snippet: data.snippet || '',
      labels,
      category: getGmailCategoryFromLabels(labels),
      unread: labels.includes('UNREAD'),
    };
  }

  async listMessages(
    sessionId: string,
    options?: { q?: string; labelIds?: string[]; maxResults?: number },
  ): Promise<GmailMessageItem[]> {
    const maxResults = Math.min(Math.max(options?.maxResults ?? 10, 1), 50);

    return this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      const list = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: options?.q?.trim() || undefined,
        labelIds:
          options?.labelIds && options.labelIds.length
            ? options.labelIds
            : undefined,
      });

      const items = list.data.messages || [];
      if (!items.length) return [];

      const details = await Promise.all(
        items.map((item) => this.messageMetadata(sessionId, item.id || '')),
      );

      return details.sort((a, b) => b.date.getTime() - a.date.getTime());
    });
  }

  async getMessage(
    sessionId: string,
    messageId: string,
  ): Promise<GmailMessageDetail> {
    return this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const data = res.data;
      const headers = (data.payload?.headers || []) as Header[];
      const bodies = extractBodies(data.payload as MessagePart | undefined);
      const base = await this.messageMetadata(sessionId, messageId);

      const rawBody = bodies.text || base.snippet || '';
      const cleanText = cleanBodyText(rawBody);
      const messageIdHeader =
        headerValue(headers, 'Message-ID') ||
        headerValue(headers, 'Message-Id');
      const referencesHeader = headerValue(headers, 'References');

      return {
        ...base,
        subject: headerValue(headers, 'Subject') || base.subject,
        from: headerValue(headers, 'From') || base.from,
        to: headerValue(headers, 'To') || base.to,
        bodyText: cleanText,
        bodyHtml: bodies.html,
        messageIdHeader: messageIdHeader || null,
        referencesHeader: referencesHeader || null,
      };
    });
  }

  async modifyLabels(
    sessionId: string,
    messageId: string,
    addLabelIds?: string[],
    removeLabelIds?: string[],
  ) {
    await this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: addLabelIds?.length ? addLabelIds : undefined,
          removeLabelIds: removeLabelIds?.length ? removeLabelIds : undefined,
        },
      });
    });
  }

  async trashMessage(sessionId: string, messageId: string) {
    await this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      await gmail.users.messages.trash({ userId: 'me', id: messageId });
    });
  }

  async untrashMessage(sessionId: string, messageId: string) {
    await this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      await gmail.users.messages.untrash({ userId: 'me', id: messageId });
    });
  }

  async deleteMessage(sessionId: string, messageId: string) {
    await this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      await gmail.users.messages.delete({ userId: 'me', id: messageId });
    });
  }

  async sendMessage(
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
  ) {
    const headers = [
      `To: ${payload.to}`,
      payload.cc ? `Cc: ${payload.cc}` : null,
      payload.bcc ? `Bcc: ${payload.bcc}` : null,
      `Subject: ${payload.subject}`,
      payload.inReplyTo ? `In-Reply-To: ${payload.inReplyTo}` : null,
      payload.references ? `References: ${payload.references}` : null,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      payload.text,
    ]
      .filter((line): line is string => line !== null)
      .join('\r\n');

    const raw = encodeBase64Url(headers);
    await this.withScopeGuard(async () => {
      const gmail = await this.authedGmail(sessionId);
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: payload.threadId
          ? { raw, threadId: payload.threadId }
          : { raw },
      });
    });
  }
}
