import { defineStore } from 'pinia';
import { ref } from 'vue';

import { createId } from '@/shared/utils/ids';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type ToastItem = {
  id: string;
  title: string;
  detail?: string;
  tone: ToastTone;
  createdAt: number;
};

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([]);

  const push = (input: {
    title: string;
    detail?: string;
    tone?: ToastTone;
    ttlMs?: number;
  }) => {
    const now = Date.now();
    const tone = input.tone ?? 'info';
    const detail = input.detail;

    for (let i = items.value.length - 1; i >= 0; i -= 1) {
      const existing = items.value[i];
      if (!existing) continue;
      if (now - existing.createdAt > 1_200) break;
      if (
        existing.title === input.title &&
        existing.detail === detail &&
        existing.tone === tone
      ) {
        return existing.id;
      }
    }

    const toast: ToastItem = {
      id: createId('toast'),
      title: input.title,
      ...(detail !== undefined ? { detail } : {}),
      tone,
      createdAt: now,
    };
    items.value = [...items.value, toast].slice(-4);

    const ttl = Math.max(1_500, Math.min(20_000, input.ttlMs ?? 4_000));
    window.setTimeout(() => dismiss(toast.id), ttl);
    return toast.id;
  };

  const dismiss = (id: string) => {
    items.value = items.value.filter((t) => t.id !== id);
  };

  const clear = () => {
    items.value = [];
  };

  return { items, push, dismiss, clear };
});
