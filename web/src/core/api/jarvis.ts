import { createHttpClient, InvalidResponseError } from "./http";
import { z } from "zod";
import {
  JarvisChatResponseSchema,
  JarvisStatusSnapshotSchema,
  InboxZeroApplyResponseSchema,
  InboxZeroDraftReplyResponseSchema,
  InboxZeroMessageResponseSchema,
  InboxZeroScanResponseSchema,
} from "../contracts/v1";

async function validated<T>(
  response: Promise<unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = schema.safeParse(await response);
  if (!parsed.success) throw new InvalidResponseError();
  return parsed.data;
}

export type JarvisApiOptions = {
  baseUrl?: string;
  timeoutMs?: number;
};

export function createJarvisApi(options: JarvisApiOptions = {}) {
  const http = createHttpClient(options);

  return {
    chat: (input: { text: string; sessionId?: string }) =>
      validated(
        http.post<unknown>("/jarvis/chat", input),
        JarvisChatResponseSchema,
      ),
    confirm: (input: { actionId: string; sessionId?: string }) =>
      validated(
        http.post<unknown>("/jarvis/confirm", input),
        JarvisChatResponseSchema,
      ),
    status: (sessionId?: string) =>
      validated(
        http.get<unknown>(
          `/jarvis/status${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
        ),
        JarvisStatusSnapshotSchema,
      ),
    googleAuthUrl: (sessionId: string) =>
      `/auth/google?sessionId=${encodeURIComponent(sessionId)}`,

    // Inbox Zero
    inboxZeroScan: (input: {
      sessionId?: string;
      query?: string;
      limit?: number;
      refresh?: boolean;
    }) =>
      validated(
        http.post<unknown>("/inbox-zero/scan", input),
        InboxZeroScanResponseSchema,
      ),
    inboxZeroSession: (sessionId?: string) =>
      validated(
        http.get<unknown>(
          `/inbox-zero/session${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
        ),
        InboxZeroScanResponseSchema,
      ),
    inboxZeroSetStep: (input: { sessionId?: string; step: string }) =>
      validated(
        http.post<unknown>("/inbox-zero/step", input),
        InboxZeroScanResponseSchema,
      ),
    inboxZeroApply: (input: Record<string, unknown>) =>
      validated(
        http.post<unknown>("/inbox-zero/apply", input),
        InboxZeroApplyResponseSchema,
      ),
    inboxZeroMessage: (sessionId: string | undefined, messageId: string) =>
      validated(
        http.get<unknown>(
          `/inbox-zero/message?messageId=${encodeURIComponent(messageId)}${
            sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""
          }`,
        ),
        InboxZeroMessageResponseSchema,
      ),
    inboxZeroDraftReply: (input: { sessionId?: string; messageId: string }) =>
      validated(
        http.post<unknown>("/inbox-zero/draft-reply", input),
        InboxZeroDraftReplyResponseSchema,
      ),
  };
}
