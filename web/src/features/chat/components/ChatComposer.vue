<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import BaseTextarea from '@/shared/ui/BaseTextarea.vue';

const props = defineProps<{
  busy: boolean;
  choices: string[];
}>();

const emit = defineEmits<{
  send: [text: string];
  abort: [];
}>();

const draft = ref('');
const canSend = computed(() => draft.value.trim().length > 0 && !props.busy);

const focusComposer = () => {
  void nextTick(() => {
    const el = document.getElementById('chat-composer');
    if (el instanceof HTMLTextAreaElement) el.focus();
  });
};

const send = () => {
  const text = draft.value.trim();
  if (!text || props.busy) return;
  emit('send', text);
  draft.value = '';
  focusComposer();
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  send();
};

const sendChoice = (choice: string) => {
  emit('send', choice);
  draft.value = '';
};
</script>

<template>
  <div class="space-y-2">
    <!-- Choice chips -->
    <Transition name="choices">
      <div v-if="choices.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="choice in choices"
          :key="choice"
          type="button"
          class="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground/80 transition hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
          :disabled="busy"
          @click="sendChoice(choice)"
        >
          {{ choice }}
        </button>
      </div>
    </Transition>

    <!-- Composer -->
    <div
      class="rounded-xl border border-border/50 bg-card/80 glass shadow-soft transition-shadow focus-within:border-primary/30 focus-within:shadow-glow-sm"
    >
      <div class="flex items-end gap-2 px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <BaseTextarea
            id="chat-composer"
            v-model="draft"
            :disabled="busy"
            :rows="2"
            placeholder="Parle à Jarvis… (Entrée pour envoyer)"
            textarea-class="max-h-40 bg-transparent border-0 p-0 focus:ring-0 resize-none"
            @keydown="onKeydown"
          />
        </div>
        <div class="flex shrink-0 items-center gap-1.5 pb-0.5">
          <button
            v-if="busy"
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border/60 transition hover:bg-muted/60 hover:text-foreground"
            @click="emit('abort')"
          >
            <svg class="size-3" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="2" width="8" height="8" rx="1" />
            </svg>
            Stop
          </button>
          <BaseButton
            variant="primary"
            size="sm"
            :disabled="!canSend"
            class="gap-1.5"
            @click="send"
          >
            <svg
              class="size-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 8l12-6-6 12V9L2 8z" />
            </svg>
            Envoyer
          </BaseButton>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-border/30 px-3 py-1.5">
        <span class="text-[11px] text-muted-foreground/40">
          Shift+Entrée pour nouvelle ligne
        </span>
        <span
          v-if="draft.length > 200"
          class="text-[11px]"
          :class="draft.length > 2000 ? 'text-amber-400' : 'text-muted-foreground/40'"
        >
          {{ draft.length }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.choices-enter-active {
  animation: fade-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.choices-leave-active {
  animation: fade-up 0.15s ease reverse;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
