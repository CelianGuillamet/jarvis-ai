import { createHttpClient } from './http';
import type { JarvisChatResponse, JarvisStatusSnapshot } from '../types/jarvis';
import type {
  InboxZeroApplyResponse,
  InboxZeroDraftReplyResponse,
  InboxZeroMessageResponse,
  InboxZeroScanResponse,
} from '../types/inbox-zero';

export type JarvisApiOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  getAuthToken?: () => string | null;
};

export function createJarvisApi(options: JarvisApiOptions = {}) {
  const http = createHttpClient(options);

  return {
    chat: (input: { text: string; sessionId?: string }) =>
      http.post<JarvisChatResponse>('/jarvis/chat', input),
    confirm: (input: { actionId: string; sessionId?: string }) =>
      http.post<JarvisChatResponse>('/jarvis/confirm', input),
    status: (sessionId?: string) =>
      http.get<JarvisStatusSnapshot>(
        `/jarvis/status${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
      ),
    googleAuthUrl: (sessionId: string) =>
      `/auth/google?sessionId=${encodeURIComponent(sessionId)}`,

    // Inbox Zero
    inboxZeroScan: (input: {
      sessionId?: string;
      query?: string;
      limit?: number;
      refresh?: boolean;
    }) => http.post<InboxZeroScanResponse>('/inbox-zero/scan', input),
    inboxZeroSession: (sessionId?: string) =>
      http.get<InboxZeroScanResponse>(
        `/inbox-zero/session${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
      ),
    inboxZeroSetStep: (input: { sessionId?: string; step: string }) =>
      http.post<InboxZeroScanResponse>('/inbox-zero/step', input),
    inboxZeroApply: (input: Record<string, unknown>) =>
      http.post<InboxZeroApplyResponse>('/inbox-zero/apply', input),
    inboxZeroMessage: (sessionId: string | undefined, messageId: string) =>
      http.get<InboxZeroMessageResponse>(
        `/inbox-zero/message?messageId=${encodeURIComponent(messageId)}${
          sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''
        }`,
      ),
    inboxZeroDraftReply: (input: { sessionId?: string; messageId: string }) =>
      http.post<InboxZeroDraftReplyResponse>('/inbox-zero/draft-reply', input),
  };
}
