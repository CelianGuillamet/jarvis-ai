import {
  AccountErasureReceiptSchema,
  AccountErasureRequestSchema,
  AccountErasureStatusSchema,
  PrivacyDisclosureSchema,
  PersonalFactInputSchema,
  PersonalFactListSchema,
  PersonalFactSchema,
  ActivityResponseSchema,
  VoiceSpeakRequestSchema,
  VoiceStatusSchema,
  VoiceTranscriptSchema,
  HomeConnectRequestSchema,
  HomeDiscoverySchema,
  HomeEntitiesRequestSchema,
  HomeStatusSchema,
  RoutineEnabledRequestSchema,
  RoutineListSchema,
  RoutineResumeRequestSchema,
  RoutineRunSchema,
  RoutineStartRequestSchema,
  InboxReplyDraftResponseSchema,
  InboxReplyDraftSaveRequestSchema,
  TodayQuerySchema,
  TodayPageResponseSchema,
  TodayMutationRequestSchema,
  TodayCommandResponseSchema,
  AccountPreferencesSchema,
  GoogleDisconnectResponseSchema,
  ChatRequestSchema,
  ConfirmRequestSchema,
  InboxZeroScanRequestSchema,
  InboxZeroStepRequestSchema,
  InboxZeroApplyRequestSchema,
  InboxZeroDraftReplyRequestSchema,
  ConversationQuerySchema,
  MessageQuerySchema,
  ConversationHistoryQuerySchema,
  ConversationHistoryResponseSchema,
} from "../contracts/v1";
import type {
  RoutineResumeRequest,
  AccountErasureRequest,
  InboxReplyDraftSaveRequest,
  TodayMutationRequest,
  AccountPreferences,
  ChatRequest,
  ConfirmRequest,
  InboxZeroScanRequest,
  InboxZeroStepRequest,
  InboxZeroApplyRequest,
  InboxZeroDraftReplyRequest,
  ConversationHistoryQuery,
} from "../contracts/v1";
import { createHttpClient, HttpError, InvalidResponseError, joinUrl } from "./http";
import { z } from "zod";
import { AccountProfileSchema } from "./account";
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

async function voiceFailure(response: Response): Promise<HttpError> {
  if (response.status === 401) window.dispatchEvent(new Event("jarvis:session-expired"));
  const payload: unknown = await response.json().catch(() => null);
  return new HttpError({ message: `HTTP ${response.status}`, status: response.status, payload });
}

async function voiceJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) throw await voiceFailure(response);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new InvalidResponseError();
  return parsed.data;
}

function checked<T>(value: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("La requête est invalide.");
  return parsed.data;
}

function queryString(
  input: Record<string, unknown>,
  schema: z.ZodType<Record<string, string | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(checked(input, schema))) {
    if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type JarvisApiOptions = {
  baseUrl?: string;
  timeoutMs?: number;
};

export function createJarvisApi(options: JarvisApiOptions = {}) {
  const http = createHttpClient(options);

  return {
    requestDeletion: (input: AccountErasureRequest) => validated(http.post<unknown>("/account/deletion", checked(input, AccountErasureRequestSchema)), AccountErasureStatusSchema),
    deletionStatus: (receipt: string, signal?: AbortSignal) => validated(http.get<unknown>("/account/deletion/status", {
      headers: { "x-erasure-receipt": checked(receipt, AccountErasureReceiptSchema) }, ...(signal ? { signal } : {}),
    }), AccountErasureStatusSchema),
    privacy: () => validated(http.get<unknown>("/account/privacy"), PrivacyDisclosureSchema),
    personalFacts: () => validated(http.get<unknown>("/account/memory"), PersonalFactListSchema),
    addPersonalFact: (text: string) =>
      validated(http.post<unknown>("/account/memory", checked({ text }, PersonalFactInputSchema)), PersonalFactSchema),
    updatePersonalFact: (id: string, text: string) =>
      validated(
        http.post<unknown>(`/account/memory/${encodeURIComponent(id)}`, checked({ text }, PersonalFactInputSchema)),
        PersonalFactSchema,
      ),
    forgetPersonalFact: (id: string) =>
      validated(http.post<unknown>(`/account/memory/${encodeURIComponent(id)}/forget`), PersonalFactListSchema),
    inboxReplyDraft: (sessionId: string, messageId: string) =>
      validated(
        http.get<unknown>(
          "/inbox-zero/reply-draft?" +
            new URLSearchParams({ sessionId, messageId }).toString(),
        ),
        InboxReplyDraftResponseSchema,
      ),
    saveInboxReplyDraft: (input: InboxReplyDraftSaveRequest) =>
      validated(
        http.post<unknown>(
          "/inbox-zero/reply-draft",
          checked(input, InboxReplyDraftSaveRequestSchema),
        ),
        InboxReplyDraftResponseSchema,
      ),
    today: (sessionId: string, taskOffset = 0, noteOffset = 0) => {
      const input = checked(
        { sessionId, taskOffset, noteOffset },
        TodayQuerySchema,
      );
      const query = new URLSearchParams(
        Object.entries(input).map(([key, value]) => [key, String(value)]),
      );
      return validated(
        http.get<unknown>("/today?" + query.toString()),
        TodayPageResponseSchema,
      );
    },
    mutateToday: (input: TodayMutationRequest) =>
      validated(
        http.post<unknown>(
          "/today/mutations",
          checked(input, TodayMutationRequestSchema),
        ),
        TodayCommandResponseSchema,
      ),
    preferences: () =>
      validated(
        http.get<unknown>("/account/preferences"),
        AccountPreferencesSchema,
      ),
    savePreferences: (input: AccountPreferences) =>
      validated(
        http.post<unknown>(
          "/account/preferences",
          checked(input, AccountPreferencesSchema),
        ),
        AccountPreferencesSchema,
      ),
    account: () =>
      validated(http.get<unknown>("/account/me"), AccountProfileSchema),
    disconnectGoogle: () =>
      validated(
        http.post<unknown>("/auth/google/disconnect", {}),
        GoogleDisconnectResponseSchema,
      ),
    chat: (input: ChatRequest, signal?: AbortSignal) =>
      validated(
        http.post<unknown>("/jarvis/chat", checked(input, ChatRequestSchema), signal ? { signal } : {}),
        JarvisChatResponseSchema,
      ),
    confirm: (input: ConfirmRequest, signal?: AbortSignal) =>
      validated(
        http.post<unknown>(
          "/jarvis/confirm",
          checked(input, ConfirmRequestSchema),
          signal ? { signal } : {},
        ),
        JarvisChatResponseSchema,
      ),
    homeStatus: () => validated(http.get<unknown>("/home"), HomeStatusSchema),
    homeConnect: (baseUrl: string, token: string) =>
      validated(http.post<unknown>("/home/connect", checked({ baseUrl, token }, HomeConnectRequestSchema)), HomeStatusSchema),
    homeDisconnect: () => validated(http.post<unknown>("/home/disconnect"), HomeStatusSchema),
    homeDiscover: () => validated(http.get<unknown>("/home/discover"), HomeDiscoverySchema),
    homeSetEntities: (entityIds: string[]) =>
      validated(http.post<unknown>("/home/entities", checked({ entityIds }, HomeEntitiesRequestSchema)), HomeStatusSchema),
    routines: () => validated(http.get<unknown>("/routines"), RoutineListSchema),
    setRoutineEnabled: (key: string, enabled: boolean) =>
      validated(
        http.post<unknown>(`/routines/${encodeURIComponent(key)}/enabled`, checked({ enabled }, RoutineEnabledRequestSchema)),
        RoutineListSchema,
      ),
    startRoutine: (key: string, requestId: string, sessionId?: string) =>
      validated(
        http.post<unknown>(
          `/routines/${encodeURIComponent(key)}/runs`,
          checked({ requestId, ...(sessionId ? { sessionId } : {}) }, RoutineStartRequestSchema),
        ),
        RoutineRunSchema,
      ),
    continueRoutine: (id: string) =>
      validated(http.post<unknown>(`/routines/runs/${encodeURIComponent(id)}/continue`), RoutineRunSchema),
    cancelRoutine: (id: string) =>
      validated(http.post<unknown>(`/routines/runs/${encodeURIComponent(id)}/cancel`), RoutineRunSchema),
    resumeRoutine: (id: string, input: RoutineResumeRequest) =>
      validated(
        http.post<unknown>(`/routines/runs/${encodeURIComponent(id)}/resume`, checked(input, RoutineResumeRequestSchema)),
        RoutineRunSchema,
      ),
    voiceStatus: () => validated(http.get<unknown>("/voice"), VoiceStatusSchema),
    transcribe: async (audio: ArrayBuffer, signal: AbortSignal) => {
      const response = await fetch(joinUrl(options.baseUrl || "", "/voice/transcribe"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "audio/wav", accept: "application/json" },
        body: audio,
        signal: AbortSignal.any([signal, AbortSignal.timeout(40_000)]),
      });
      return (await voiceJson(response, VoiceTranscriptSchema)).text;
    },
    speak: async (text: string, signal: AbortSignal) => {
      const response = await fetch(joinUrl(options.baseUrl || "", "/voice/speak"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "audio/wav" },
        body: JSON.stringify(checked({ text }, VoiceSpeakRequestSchema)),
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw await voiceFailure(response);
      return response.arrayBuffer();
    },
    activity: (input: ConversationHistoryQuery, signal?: AbortSignal) => {
      const query = checked(input, ConversationHistoryQuerySchema);
      const params = new URLSearchParams({ limit: String(query.limit) });
      if (query.sessionId) params.set("sessionId", query.sessionId);
      if (query.cursor) params.set("cursor", query.cursor);
      return validated(http.get<unknown>(`/jarvis/activity?${params}`, signal ? { signal } : {}), ActivityResponseSchema);
    },
    history: (input: ConversationHistoryQuery, signal?: AbortSignal) => {
      const query = checked(input, ConversationHistoryQuerySchema);
      const params = new URLSearchParams();
      if (query.sessionId) params.set("sessionId", query.sessionId);
      if (query.cursor) params.set("cursor", query.cursor);
      params.set("limit", String(query.limit));
      return validated(
        http.get<unknown>(`/jarvis/history?${params}`, signal ? { signal } : {}),
        ConversationHistoryResponseSchema,
      );
    },
    status: (sessionId?: string) =>
      validated(
        http.get<unknown>(
          "/jarvis/status" +
            queryString({ sessionId }, ConversationQuerySchema),
        ),
        JarvisStatusSnapshotSchema,
      ),
    refreshStatus: (sessionId?: string) =>
      validated(
        http.post<unknown>(
          "/jarvis/status/refresh",
          checked({ sessionId }, ConversationQuerySchema),
        ),
        JarvisStatusSnapshotSchema,
      ),
    googleAuthUrl: (sessionId: string) =>
      joinUrl(options.baseUrl || "", "/auth/google") +
      queryString({ sessionId }, ConversationQuerySchema),

    // Inbox Zero
    inboxZeroScan: (input: InboxZeroScanRequest) =>
      validated(
        http.post<unknown>(
          "/inbox-zero/scan",
          checked(input, InboxZeroScanRequestSchema),
        ),
        InboxZeroScanResponseSchema,
      ),
    inboxZeroSession: (sessionId?: string) =>
      validated(
        http.get<unknown>(
          "/inbox-zero/session" +
            queryString({ sessionId }, ConversationQuerySchema),
        ),
        InboxZeroScanResponseSchema,
      ),
    inboxZeroSetStep: (input: InboxZeroStepRequest) =>
      validated(
        http.post<unknown>(
          "/inbox-zero/step",
          checked(input, InboxZeroStepRequestSchema),
        ),
        InboxZeroScanResponseSchema,
      ),
    inboxZeroApply: (input: InboxZeroApplyRequest) =>
      validated(
        http.post<unknown>(
          "/inbox-zero/apply",
          checked(input, InboxZeroApplyRequestSchema),
        ),
        InboxZeroApplyResponseSchema,
      ),
    inboxZeroMessage: (sessionId: string | undefined, messageId: string) =>
      validated(
        http.get<unknown>(
          "/inbox-zero/message" +
            queryString({ sessionId, messageId }, MessageQuerySchema),
        ),
        InboxZeroMessageResponseSchema,
      ),
    inboxZeroDraftReply: (input: InboxZeroDraftReplyRequest) =>
      validated(
        http.post<unknown>(
          "/inbox-zero/draft-reply",
          checked(input, InboxZeroDraftReplyRequestSchema),
        ),
        InboxZeroDraftReplyResponseSchema,
      ),
  };
}
