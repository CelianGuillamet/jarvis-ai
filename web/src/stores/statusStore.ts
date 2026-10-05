import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import type { JarvisStatusSnapshot } from '@/core/types/jarvis';
import { TimeoutError } from '@/core/api/http';
import { useAppStore } from './appStore';
import { useToastStore } from './toastStore';

export const useStatusStore = defineStore('status', () => {
  const app = useAppStore();
  const toast = useToastStore();

  const snapshot = ref<JarvisStatusSnapshot | null>(null);
  const busy = ref(false);
  const lastSyncAt = ref<number | null>(null);
  let generation = 0;
  const reset = () => {
    generation += 1;
    snapshot.value = null;
    busy.value = false;
    lastSyncAt.value = null;
  };
  watch(() => [app.sessionId, app.accountEpoch], reset, { flush: 'sync' });

  const integrations = computed(() => snapshot.value?.integrations ?? null);
  const quickActions = computed(() => snapshot.value?.quickActions ?? []);
  const suggestions = computed(() => snapshot.value?.proactiveSuggestions ?? []);

  const refresh = async (refreshProviders = false) => {
    if (busy.value) return;
    busy.value = true;
    const currentGeneration = generation;
    try {
      const next = await (refreshProviders ? app.jarvis.refreshStatus(app.sessionId) : app.jarvis.status(app.sessionId));
      if (currentGeneration !== generation) return;
      snapshot.value = next;
      lastSyncAt.value = Date.now();
    } catch (error) {
      if (currentGeneration !== generation) return;
      if (error instanceof TimeoutError) {
        toast.push({
          title: 'Sync trop lente',
          detail: 'La lecture du status a expiré. Réessaie.',
          tone: 'warning',
        });
      } else {
        toast.push({
          title: 'Erreur status',
          detail: error instanceof Error ? error.message : 'Erreur inconnue.',
          tone: 'danger',
        });
      }
    } finally {
      if (currentGeneration === generation) busy.value = false;
    }
  };

  return {
    snapshot,
    busy,
    lastSyncAt,
    integrations,
    quickActions,
    suggestions,
    refresh,
    reset,
  };
});
