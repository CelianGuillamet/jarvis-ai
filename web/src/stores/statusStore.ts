import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

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

  const integrations = computed(() => snapshot.value?.integrations ?? null);
  const quickActions = computed(() => snapshot.value?.quickActions ?? []);
  const suggestions = computed(() => snapshot.value?.proactiveSuggestions ?? []);

  const refresh = async () => {
    busy.value = true;
    try {
      const next = await app.jarvis.status(app.sessionId);
      snapshot.value = next;
      lastSyncAt.value = Date.now();
    } catch (error) {
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
      busy.value = false;
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
  };
});

