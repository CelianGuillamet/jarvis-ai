<script setup lang="ts">
import { computed } from 'vue';
import type { ReminderRecord } from '@/core/types/jarvis';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'vue-router';
import BaseCard from '@/shared/ui/BaseCard.vue';
import BaseSkeleton from '@/shared/ui/BaseSkeleton.vue';

const props = defineProps<{
  reminders: ReminderRecord[];
  loading: boolean;
}>();

const chat = useChatStore();
const router = useRouter();

const sorted = computed(() =>
  [...props.reminders].sort(
    (a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime(),
  ),
);

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const isOverdue = (iso: string) => new Date(iso) < new Date();

const sendAndNav = async (text: string) => {
  await router.push('/chat');
  await chat.send(text);
};
</script>

<template>
  <BaseCard class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        Rappels
      </p>
      <button
        type="button"
        class="text-[11px] text-primary/70 transition hover:text-primary"
        @click="sendAndNav('Crée-moi un rappel')"
      >
        + Nouveau
      </button>
    </div>

    <div v-if="loading && !reminders.length" class="space-y-2">
      <BaseSkeleton class="h-10 w-full" />
      <BaseSkeleton class="h-10 w-3/4" />
    </div>

    <div v-else-if="!sorted.length" class="py-4 text-center text-xs text-muted-foreground/40">
      Aucun rappel à venir. Tape "rappelle-moi de…"
    </div>

    <div v-else class="space-y-1.5">
      <div
        v-for="r in sorted"
        :key="r.id"
        class="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition"
        :class="
          isOverdue(r.triggerAt)
            ? 'border-red-500/25 bg-red-500/5 text-red-300'
            : 'border-border/50 bg-muted/20 text-foreground/80 hover:bg-muted/40'
        "
      >
        <span class="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">
          {{ isOverdue(r.triggerAt) ? '🔴' : r.recurring ? '🔁' : '⏰' }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ r.text }}</p>
          <p class="mt-0.5 text-[10px] opacity-60">{{ formatTime(r.triggerAt) }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg px-1.5 py-1 opacity-50 transition hover:bg-muted/60 hover:opacity-100"
          aria-label="Marquer comme fait"
          @click="sendAndNav(`Rappel fait: ${r.text}`)"
        >
          <svg class="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 6l3.5 3.5L11 2" />
          </svg>
        </button>
      </div>
    </div>
  </BaseCard>
</template>
