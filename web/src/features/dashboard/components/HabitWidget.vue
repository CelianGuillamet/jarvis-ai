<script setup lang="ts">
import type { HabitRecord } from '@/core/types/jarvis';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'vue-router';
import BaseCard from '@/shared/ui/BaseCard.vue';
import BaseSkeleton from '@/shared/ui/BaseSkeleton.vue';

const props = defineProps<{
  habits: HabitRecord[];
  loading: boolean;
}>();

const chat = useChatStore();
const router = useRouter();

const sendAndNav = async (text: string) => {
  await router.push('/chat');
  await chat.send(text);
};

const logHabit = (habit: HabitRecord) => {
  sendAndNav(`J'ai fait "${habit.name}" aujourd'hui`);
};
</script>

<template>
  <BaseCard class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        Habitudes
      </p>
      <button
        type="button"
        class="text-[11px] text-primary/70 transition hover:text-primary"
        @click="sendAndNav('Crée-moi une nouvelle habitude')"
      >
        + Nouvelle
      </button>
    </div>

    <div v-if="loading && !habits.length" class="space-y-2">
      <BaseSkeleton class="h-10 w-full" />
      <BaseSkeleton class="h-10 w-full" />
    </div>

    <div v-else-if="!habits.length" class="py-4 text-center text-xs text-muted-foreground/40">
      Aucune habitude. Tape "crée une habitude sport quotidien".
    </div>

    <div v-else class="space-y-1.5">
      <div
        v-for="h in habits"
        :key="h.id"
        class="flex items-center gap-2.5 rounded-xl border px-3 py-2 transition"
        :class="
          h.loggedToday
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : 'border-border/50 bg-muted/20 hover:bg-muted/40'
        "
      >
        <!-- Emoji / check -->
        <span class="shrink-0 text-base leading-none" aria-hidden="true">
          {{ h.loggedToday ? '✅' : (h.emoji ?? '🔲') }}
        </span>

        <!-- Name + streak -->
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium" :class="h.loggedToday ? 'text-emerald-300' : 'text-foreground/80'">
            {{ h.name }}
          </p>
          <p class="mt-0.5 text-[10px] text-muted-foreground/50">
            <span v-if="h.streak > 1">🔥 {{ h.streak }} jours · </span>
            {{ h.totalLogs }} total
          </p>
        </div>

        <!-- Log button (only if not done today) -->
        <button
          v-if="!h.loggedToday"
          type="button"
          class="shrink-0 rounded-lg border border-border/50 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
          @click="logHabit(h)"
        >
          Fait !
        </button>
      </div>
    </div>

    <!-- Summary bar -->
    <div v-if="habits.length" class="mt-3 flex items-center gap-2 border-t border-border/30 pt-3">
      <div class="flex-1 overflow-hidden rounded-full bg-muted/50 h-1.5">
        <div
          class="h-full rounded-full bg-emerald-400 transition-all duration-500"
          :style="`width: ${habits.length ? Math.round((habits.filter(h => h.loggedToday).length / habits.length) * 100) : 0}%`"
        />
      </div>
      <span class="shrink-0 text-[10px] text-muted-foreground/50">
        {{ habits.filter(h => h.loggedToday).length }}/{{ habits.length }} aujourd'hui
      </span>
    </div>
  </BaseCard>
</template>
