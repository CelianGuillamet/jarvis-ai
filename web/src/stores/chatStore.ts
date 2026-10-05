import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import type { JarvisChatResponse, PendingActionView } from '@/core/types/jarvis';
import { TimeoutError } from '@/core/api/http';
import { createId } from '@/shared/utils/ids';
import { useAppStore } from './appStore';
import { useToastStore } from './toastStore';
import { historyMessages, restoredPending } from '@/features/chat/history';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  meta?: JarvisChatResponse['meta'];
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export const useChatStore = defineStore('chat', () => {
  const app = useAppStore();
  const toast = useToastStore();

  const messages = ref<ChatMessage[]>([]);
  const pendingAction = ref<PendingActionView | null>(null);
  const choices = ref<string[]>([]);
  const busy = ref(false);
  const lastMeta = ref<JarvisChatResponse['meta'] | null>(null);
  const historyBusy = ref(false);
  const historyLoaded = ref(false);
  const historyCursor = ref<string | null>(null);
  const historyFetchedAt = ref<string | null>(null);
  const historyError = ref<string | null>(null);
  const historyPendingId = ref<string | null>(null);
  let generation = 0;

  const loadHistory = async (older = false) => {
    if (historyBusy.value || busy.value || (!older && historyLoaded.value)) return;
    if (older && !historyCursor.value) return;
    const currentGeneration = generation;
    const controller = new AbortController();
    activeAbort.value = controller;
    historyBusy.value = true;
    historyError.value = null;
    try {
      const page = await app.jarvis.history({
        sessionId: app.sessionId,
        limit: 20,
        ...(older && historyCursor.value ? { cursor: historyCursor.value } : {}),
      }, controller.signal);
      if (currentGeneration !== generation) return;
      const restored = historyMessages(page);
      const existingIds = new Set(messages.value.map(message => message.id));
      messages.value = [...restored.filter(message => !existingIds.has(message.id)), ...messages.value];
      historyCursor.value = page.nextCursor;
      historyFetchedAt.value = page.fetchedAt;
      historyLoaded.value = true;
      if (!older) {
        historyPendingId.value = page.pendingCommand?.id ?? null;
        pendingAction.value = restoredPending(page);
        const latest = page.turns.at(-1)?.response;
        choices.value = latest?.choices ?? [];
        lastMeta.value = pendingAction.value ? { awaiting: 'confirm' } : null;
      }
    } catch (error) {
      if (currentGeneration !== generation) return;
      historyError.value = error instanceof Error ? error.message : 'Historique indisponible.';
    } finally {
      if (currentGeneration === generation) historyBusy.value = false;
      if (activeAbort.value === controller) activeAbort.value = null;
    }
  };

  const restorePendingFromStatus = (pending: PendingActionView | null) => {
    if (!historyLoaded.value || busy.value) return;
    if (pendingAction.value && pending?.id !== pendingAction.value.id) {
      pendingAction.value = null;
      if (lastMeta.value?.awaiting === 'confirm') lastMeta.value = null;
    }
    if (!pending || pending.id !== historyPendingId.value) return;
    if (pendingAction.value?.id === pending.id) return;
    pendingAction.value = pending;
    lastMeta.value = { awaiting: 'confirm' };
  };

  const canConfirmPending = computed(
    () => !!pendingAction.value && lastMeta.value?.awaiting === 'confirm',
  );
  const canConnectGoogle = computed(
    () => lastMeta.value?.awaiting === 'connect_google',
  );

  const activeAbort = ref<AbortController | null>(null);

  const pushMessage = (input: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    messages.value = [
      ...messages.value,
      {
        id: createId('msg'),
        createdAt: Date.now(),
        ...input,
      },
    ];
  };

  const applyJarvisResponse = (res: JarvisChatResponse) => {
    pendingAction.value = res.pending_action ?? null;
    choices.value = Array.isArray(res.choices) ? res.choices : [];
    lastMeta.value = res.meta ?? null;
    pushMessage({ role: 'assistant', text: res.text, meta: res.meta });
    if (res.meta?.historySaved === false) {
      pushMessage({
        role: 'system',
        text: 'Ce résultat a été reçu, mais sa sauvegarde dans l’historique a échoué. Ne relance pas une action déjà réalisée pour cette seule raison.',
      });
    }
  };

  const abort = () => {
    if (!busy.value && !historyBusy.value) return;
    generation += 1;
    historyBusy.value = false;
    pendingAction.value = null;
    choices.value = [];
    lastMeta.value = null;
    pushMessage({ role: 'system', text: 'Réception arrêtée. Une commande déjà transmise peut avoir été exécutée. Vérifiez l’historique et l’activité avant de la relancer.' });
    activeAbort.value?.abort();
    activeAbort.value = null;
    busy.value = false;
  };

  const send = async (textRaw: string) => {
    const text = normalizeText(textRaw);
    if (!text) return;
    if (busy.value || historyBusy.value) return;
    const startingGeneration = generation;
    if (!historyLoaded.value) {
      await loadHistory();
      if (startingGeneration !== generation) return;
      if (!historyLoaded.value) {
        toast.push({ title: 'Historique indisponible', detail: historyError.value ?? 'Recharge l’historique avant de poursuivre.', tone: 'danger' });
        return;
      }
    }
    const currentGeneration = generation;

    pushMessage({ role: 'user', text });
    busy.value = true;
    pendingAction.value = null;
    choices.value = [];

    const controller = new AbortController();
    activeAbort.value = controller;

    try {
      const res = await app.jarvis.chat({
        text,
        sessionId: app.sessionId,
      }, controller.signal);
      if (currentGeneration !== generation) return;
      applyJarvisResponse(res);
    } catch (error) {
      if (currentGeneration !== generation) return;
      if (error instanceof TimeoutError) {
        toast.push({
          title: 'Temps dépassé',
          detail: 'La réponse n’a pas été reçue à temps. Vérifie le résultat avant de renouveler une action.',
          tone: 'warning',
        });
      } else {
        toast.push({
          title: 'Erreur',
          detail: error instanceof Error ? error.message : 'Erreur inconnue.',
          tone: 'danger',
        });
      }
      pushMessage({
        role: 'system',
        text: `Erreur: ${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`,
      });
    } finally {
      if (currentGeneration === generation) busy.value = false;
      if (activeAbort.value === controller) activeAbort.value = null;
    }
  };

  const confirmPending = async () => {
    if (!pendingAction.value || busy.value || historyBusy.value) return;
    busy.value = true;
    const actionId = pendingAction.value.id;
    const controller = new AbortController();
    activeAbort.value = controller;
    const currentGeneration = generation;

    try {
      const res = await app.jarvis.confirm({
        actionId,
        sessionId: app.sessionId,
      }, controller.signal);
      if (currentGeneration !== generation) return;
      applyJarvisResponse(res);
    } catch (error) {
      if (currentGeneration !== generation) return;
      toast.push({
        title: 'Erreur confirmation',
        detail: error instanceof Error ? error.message : 'Erreur inconnue.',
        tone: 'danger',
      });
      pushMessage({
        role: 'system',
        text: `Erreur: ${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`,
      });
    } finally {
      if (currentGeneration === generation) busy.value = false;
      if (activeAbort.value === controller) activeAbort.value = null;
    }
  };

  const cancelPending = async () => {
    // Pas d'endpoint dédié: on repasse par le chat pour annuler proprement.
    await send('non');
  };

  const openGoogleConnect = () => {
    const url = app.jarvis.googleAuthUrl(app.sessionId);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const reset = () => {
    generation += 1;
    historyBusy.value = false;
    historyLoaded.value = false;
    historyCursor.value = null;
    historyFetchedAt.value = null;
    historyError.value = null;
    historyPendingId.value = null;
    messages.value = [];
    pendingAction.value = null;
    choices.value = [];
    busy.value = false;
    lastMeta.value = null;
    activeAbort.value?.abort();
    activeAbort.value = null;
  };

  watch(() => [app.sessionId, app.accountEpoch], reset, { flush: 'sync' });

  return {
    messages,
    pendingAction,
    choices,
    busy,
    lastMeta,
    historyBusy,
    historyLoaded,
    historyCursor,
    historyFetchedAt,
    historyError,
    loadHistory,
    restorePendingFromStatus,
    canConfirmPending,
    canConnectGoogle,
    send,
    confirmPending,
    cancelPending,
    openGoogleConnect,
    abort,
    reset,
  };
});
