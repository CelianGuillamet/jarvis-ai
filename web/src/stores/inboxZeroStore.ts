import type { InboxZeroApplyRequest, InboxZeroApplyResponse } from '@/core/contracts/v1';
import { InboxZeroApplyResultSchema } from '@/core/contracts/v1';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type {
  InboxZeroActionType,
  InboxZeroDraftReplyResponse,
  InboxZeroItemView,
  InboxZeroMessageResponse,
  InboxZeroScanResponse,
  InboxZeroSessionView,
  InboxZeroStep,
} from '@/core/types/inbox-zero';
import { TimeoutError } from '@/core/api/http';
import { replyRequestId, completeReplyRequest } from '@/core/api/inbox-reply-identity';
import { useAppStore } from './appStore';
import { useToastStore } from './toastStore';

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function stepFilter(step: InboxZeroStep, items: InboxZeroItemView[]) {
  switch (step) {
    case 'urgent':
      return items.filter((i) => i.category === 'urgent');
    case 'quick_wins':
      return items.filter((i) => i.category === 'quick_wins');
    case 'schedule':
      return items.filter((i) => i.category === 'schedule');
    case 'cleanup':
      return items.filter((i) => i.category === 'ignore' || i.category === 'newsletters');
    case 'done':
      return [];
  }
}

export const useInboxZeroStore = defineStore('inboxZero', () => {
  const app = useAppStore();
  const toast = useToastStore();

  let messageLoadToken = 0;
  let draftLoadToken = 0;

  const session = ref<InboxZeroSessionView | null>(null);
  const items = ref<InboxZeroItemView[]>([]);
  const actionResults = ref<InboxZeroApplyResponse['results']>([]);
  const actionError = ref('');
  const recentActions = ref<InboxZeroScanResponse['recentActions']>([]);

  const busy = ref(false);
  const detailBusy = ref(false);
  const draftBusy = ref(false);

  const selectedIds = ref<string[]>([]);
  const cursorId = ref<string | null>(null);

  const messagePanel = ref<InboxZeroMessageResponse | null>(null);
  const draft = ref<InboxZeroDraftReplyResponse | null>(null);
  const replyText = ref('');
  const replyReview = ref<{
    messageId: string;
    conversationId: string;
    text: string;
    to: string;
    subject: string;
  } | null>(null);

  const reminderWhen = ref('demain 9h');
  const reminderText = ref('');

  const currentStep = computed<InboxZeroStep>(() => session.value?.step ?? 'urgent');
  const filteredItems = computed(() => stepFilter(currentStep.value, items.value));
  const selectedCount = computed(() => selectedIds.value.length);
  const hasSelection = computed(() => selectedCount.value > 0);

  const isSelected = (messageId: string) => selectedIds.value.includes(messageId);

  const syncCursor = (preferredIndex?: number) => {
    const visible = filteredItems.value.map((i) => i.messageId);
    if (!visible.length) {
      cursorId.value = null;
      return;
    }

    if (cursorId.value && visible.includes(cursorId.value)) return;

    if (typeof preferredIndex === 'number' && Number.isFinite(preferredIndex)) {
      const idx = Math.min(Math.max(0, Math.floor(preferredIndex)), visible.length - 1);
      cursorId.value = visible[idx] ?? null;
      return;
    }

    cursorId.value = visible[0] ?? null;
  };

  const setCursor = (messageId: string) => {
    const id = messageId.trim();
    if (!id) return;
    cursorId.value = id;
  };

  const moveCursor = (delta: number) => {
    const visible = filteredItems.value.map((i) => i.messageId);
    if (!visible.length) return;

    const current = cursorId.value;
    const startIndex = current ? visible.indexOf(current) : -1;
    const base = startIndex >= 0 ? startIndex : 0;
    const next = Math.min(Math.max(0, base + delta), visible.length - 1);
    cursorId.value = visible[next] ?? null;
  };

  const toggleSelection = (messageId: string) => {
    const id = messageId.trim();
    if (!id) return;
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter((x) => x !== id);
      return;
    }
    selectedIds.value = [...selectedIds.value, id];
  };

  const clearSelection = () => {
    selectedIds.value = [];
  };

  const selectAllVisible = () => {
    selectedIds.value = uniqueStrings(filteredItems.value.map((i) => i.messageId));
  };

  const applyScanResponse = (
    res: InboxZeroScanResponse,
    options?: { cursorHintIndex?: number },
  ) => {
    session.value = res.session;
    items.value = res.items ?? [];
    recentActions.value = res.recentActions ?? [];
    const recovered = new Map<string, InboxZeroApplyResponse['results'][number]>();
    for (const action of recentActions.value) {
      const candidates = action.payload?.results;
      if (!Array.isArray(candidates)) continue;
      for (const candidate of candidates) {
        const parsed = InboxZeroApplyResultSchema.safeParse(candidate);
        if (parsed.success && !recovered.has(parsed.data.messageId))
          recovered.set(parsed.data.messageId, parsed.data);
      }
    }
    if (recovered.size) actionResults.value = [...recovered.values()].slice(0, 100);
    selectedIds.value = selectedIds.value.filter((id) =>
      items.value.some((i) => i.messageId === id),
    );
    syncCursor(options?.cursorHintIndex);
  };

  const scan = async (options?: { refresh?: boolean; query?: string }) => {
    busy.value = true;
    try {
      const res = await app.jarvis.inboxZeroScan({
        sessionId: app.sessionId,
        refresh: options?.refresh ?? true,
        ...(options?.query ? { query: options.query } : {}),
        limit: 40,
      });
      applyScanResponse(res);
    } catch (error) {
      if (error instanceof TimeoutError) {
        toast.push({
          title: 'Scan trop lent',
          detail: 'Le scan Inbox Zero a expiré. Réessaie ou augmente le timeout.',
          tone: 'warning',
        });
      } else {
        toast.push({
          title: 'Erreur Inbox Zero',
          detail: error instanceof Error ? error.message : 'Erreur inconnue.',
          tone: 'danger',
        });
      }
    } finally {
      busy.value = false;
    }
  };

  const loadSession = async () => {
    busy.value = true;
    try {
      const res = await app.jarvis.inboxZeroSession(app.sessionId);
      applyScanResponse(res);
    } catch (error) {
      toast.push({
        title: 'Erreur reprise',
        detail: error instanceof Error ? error.message : 'Erreur inconnue.',
        tone: 'danger',
      });
    } finally {
      busy.value = false;
    }
  };

  const setStep = async (step: InboxZeroStep) => {
    busy.value = true;
    try {
      const res = await app.jarvis.inboxZeroSetStep({
        sessionId: app.sessionId,
        step,
      });
      applyScanResponse(res);
      clearSelection();
    } catch (error) {
      toast.push({
        title: 'Erreur étape',
        detail: error instanceof Error ? error.message : 'Erreur inconnue.',
        tone: 'danger',
      });
    } finally {
      busy.value = false;
    }
  };

  const openMessage = async (messageId: string) => {
    const token = ++messageLoadToken;
    draftLoadToken += 1;
    setCursor(messageId);
    detailBusy.value = true;
    draft.value = null;
    replyReview.value = null;
    replyText.value = '';
    try {
      const res = await app.jarvis.inboxZeroMessage(app.sessionId, messageId);
      if (token !== messageLoadToken) return;
      messagePanel.value = res;
    } catch (error) {
      if (token !== messageLoadToken) return;
      toast.push({
        title: 'Erreur email',
        detail: error instanceof Error ? error.message : 'Erreur inconnue.',
        tone: 'danger',
      });
    } finally {
      if (token === messageLoadToken) detailBusy.value = false;
    }
  };

  const closeMessage = () => {
    messageLoadToken += 1;
    draftLoadToken += 1;
    messagePanel.value = null;
    draft.value = null;
    replyReview.value = null;
    replyText.value = '';
    reminderText.value = '';
  };

  const createDraftReply = async (messageId: string) => {
    const token = ++draftLoadToken;
    draftBusy.value = true;
    try {
      const res = await app.jarvis.inboxZeroDraftReply({
        sessionId: app.sessionId,
        messageId,
      });
      if (token !== draftLoadToken) return;
      if (messagePanel.value && messagePanel.value.message.id !== messageId) return;
      draft.value = res;
      replyText.value = res.draftText;
    } catch (error) {
      if (token !== draftLoadToken) return;
      toast.push({
        title: 'Erreur draft',
        detail: error instanceof Error ? error.message : 'Erreur inconnue.',
        tone: 'danger',
      });
    } finally {
      if (token === draftLoadToken) draftBusy.value = false;
    }
  };

  const apply = async (
    action: InboxZeroActionType,
    extra?: Pick<
      InboxZeroApplyRequest,
      'replyText' | 'reminderWhen' | 'reminderText' | 'archiveAfter' | 'reviewedReply'
    >,
    options?: { cursorHintIndex?: number },
  ) => {
    if (busy.value) return false;
    const messageIds = uniqueStrings(selectedIds.value);
    if (!messageIds.length) return false;

    actionError.value = '';
    busy.value = true;
    try {
      const visibleBefore = filteredItems.value.map((i) => i.messageId);
      const cursorIndexBefore = cursorId.value ? visibleBefore.indexOf(cursorId.value) : -1;
      const firstSelectedIndex = visibleBefore.indexOf(messageIds[0] || '');
      const cursorHintIndex =
        options?.cursorHintIndex ??
        (cursorIndexBefore >= 0
          ? cursorIndexBefore
          : firstSelectedIndex >= 0
            ? firstSelectedIndex
            : undefined);

      const conversationId = session.value?.sessionId;
      const requestId =
        action === 'send_reply'
          ? await replyRequestId({
              conversationId: conversationId ?? '',
              messageId: messageIds[0]!,
              replyText: String(extra?.replyText ?? ''),
              archiveAfter: extra?.archiveAfter !== false,
              ...(extra?.reviewedReply ? { reviewedReply: extra.reviewedReply } : {}),
            })
          : undefined;
      const res = await app.jarvis.inboxZeroApply({
        sessionId: app.sessionId,
        action,
        messageIds,
        ...(extra ?? {}),
        ...(requestId ? { requestId } : {}),
      });
      if (requestId && conversationId && res.results.length === 1 && res.results[0]?.ok)
        await completeReplyRequest(conversationId, messageIds[0]!, requestId);
      const changed = new Set(res.results.map((result) => result.messageId));
      actionResults.value = [
        ...res.results,
        ...actionResults.value.filter((result) => !changed.has(result.messageId)),
      ].slice(0, 100);
      applyScanResponse(res, cursorHintIndex !== undefined ? { cursorHintIndex } : undefined);

      const uncertain = res.results.filter((r) => r.outcome === 'unknown').length;
      const partial = res.results.filter((r) => r.outcome === 'partial').length;
      const simulated = res.results.filter((r) => r.outcome === 'simulated').length;
      if (uncertain || partial) {
        toast.push({
          title: uncertain ? 'Résultat incertain' : 'Actions partielles',
          detail: uncertain
            ? `${uncertain} résultat(s) incertain(s). Vérifie l’état avant toute nouvelle tentative.`
            : `${partial} email(s) envoyé(s) avec des étapes restantes. Une reprise conserve l’envoi existant.`,
          tone: 'warning',
          ttlMs: 6_000,
        });
      } else {
        toast.push({
          title: simulated ? 'Simulation terminée' : 'Actions terminées',
          detail: simulated
            ? `${simulated} action(s) simulée(s), sans modification.`
            : `${res.results.length} email(s) traités.`,
          tone: 'success',
        });
      }
      clearSelection();
      return res.results.length === messageIds.length && res.results.every((result) => result.ok);
    } catch (error) {
      actionError.value =
        error instanceof Error
          ? error.message
          : 'Résultat non confirmé. Vérifiez l’état avant de reprendre.';
      toast.push({
        title: 'Erreur action',
        detail: actionError.value,
        tone: 'danger',
      });
      return false;
    } finally {
      busy.value = false;
    }
  };

  const openCursorMessage = async () => {
    if (!cursorId.value) return;
    await openMessage(cursorId.value);
  };

  const toggleCursorSelection = () => {
    if (!cursorId.value) return;
    toggleSelection(cursorId.value);
  };

  const applyToCursor = async (action: InboxZeroActionType, extra?: Record<string, unknown>) => {
    if (!cursorId.value) return;
    selectedIds.value = [cursorId.value];
    await apply(action, extra);
    if (messagePanel.value && action !== 'star') closeMessage();
  };

  const applySuggested = async (item: InboxZeroItemView) => {
    const suggested = item.suggested;
    if (!suggested) return;

    if (suggested.action === 'draft_reply') {
      await openMessage(item.messageId);
      await createDraftReply(item.messageId);
      return;
    }

    if (suggested.action === 'remind') {
      selectedIds.value = [item.messageId];
      const when = reminderWhen.value.trim();
      if (!when) {
        toast.push({
          title: 'Rappel manquant',
          detail: 'Renseigne un créneau (ex: demain 9h) puis réessaie.',
          tone: 'warning',
        });
        return;
      }
      await apply('remind', {
        reminderWhen: when,
        ...(reminderText.value.trim() ? { reminderText: reminderText.value.trim() } : {}),
        archiveAfter: true,
      });
      return;
    }

    selectedIds.value = [item.messageId];
    await apply(suggested.action);
  };

  const reviewReply = (messageId: string) => {
    if (
      busy.value ||
      !replyText.value.trim() ||
      messagePanel.value?.message.id !== messageId ||
      !session.value
    )
      return;
    replyReview.value = {
      messageId,
      conversationId: session.value.sessionId,
      text: replyText.value.trim(),
      ...messagePanel.value.reply,
    };
  };

  const sendReply = async (messageId: string) => {
    const text = replyText.value.trim();
    const review = replyReview.value;
    if (
      actionResults.value.some(
        (result) => result.messageId === messageId && result.outcome === 'unknown',
      )
    ) {
      actionError.value =
        'Le résultat de cet envoi est incertain. Vérifiez le message envoyé avant toute nouvelle action.';
      return;
    }
    if (
      !text ||
      !review ||
      review.messageId !== messageId ||
      review.text !== text ||
      review.conversationId !== session.value?.sessionId
    )
      return;
    selectedIds.value = [messageId];
    const completed = await apply('send_reply', {
      replyText: review.text,
      reviewedReply: { to: review.to, subject: review.subject },
      archiveAfter: true,
    });
    if (
      completed &&
      messagePanel.value?.message.id === messageId &&
      replyText.value.trim() === text
    )
      closeMessage();
  };

  const createReminder = async (messageId: string) => {
    selectedIds.value = [messageId];
    const when = reminderWhen.value.trim();
    if (!when) return;
    await apply('remind', {
      reminderWhen: when,
      ...(reminderText.value.trim() ? { reminderText: reminderText.value.trim() } : {}),
      archiveAfter: true,
    });
    closeMessage();
  };

  return {
    session,
    items,
    recentActions,
    actionResults,
    actionError,
    busy,
    detailBusy,
    draftBusy,
    selectedIds,
    cursorId,
    messagePanel,
    draft,
    replyText,
    replyReview,
    reviewReply,
    reminderWhen,
    reminderText,
    currentStep,
    filteredItems,
    selectedCount,
    hasSelection,
    isSelected,
    syncCursor,
    setCursor,
    moveCursor,
    toggleSelection,
    toggleCursorSelection,
    clearSelection,
    selectAllVisible,
    scan,
    loadSession,
    setStep,
    openMessage,
    openCursorMessage,
    closeMessage,
    createDraftReply,
    applyToCursor,
    applySuggested,
    sendReply,
    createReminder,
    apply,
  };
});
