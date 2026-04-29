import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { JarvisChatResponse, PendingActionView } from '@/core/types/jarvis';
import { TimeoutError } from '@/core/api/http';
import { createId } from '@/shared/utils/ids';
import { useAppStore } from './appStore';
import { useToastStore } from './toastStore';

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
  };

  const abort = () => {
    activeAbort.value?.abort();
    activeAbort.value = null;
    busy.value = false;
  };

  const send = async (textRaw: string) => {
    const text = normalizeText(textRaw);
    if (!text) return;

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
      });
      applyJarvisResponse(res);
    } catch (error) {
      if (error instanceof TimeoutError) {
        toast.push({
          title: 'Temps dépassé',
          detail: 'Jarvis prend plus de temps que prévu. Réessaie ou augmente le timeout.',
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
      busy.value = false;
      if (activeAbort.value === controller) activeAbort.value = null;
    }
  };

  const confirmPending = async () => {
    if (!pendingAction.value) return;
    busy.value = true;
    const actionId = pendingAction.value.id;

    try {
      const res = await app.jarvis.confirm({
        actionId,
        sessionId: app.sessionId,
      });
      applyJarvisResponse(res);
    } catch (error) {
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
      busy.value = false;
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
    messages.value = [];
    pendingAction.value = null;
    choices.value = [];
    busy.value = false;
    lastMeta.value = null;
    activeAbort.value?.abort();
    activeAbort.value = null;
  };

  return {
    messages,
    pendingAction,
    choices,
    busy,
    lastMeta,
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

