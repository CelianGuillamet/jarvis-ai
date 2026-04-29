<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { renderMarkdown } from '@/shared/utils/markdown';
import BaseBadge from '@/shared/ui/BaseBadge.vue';
import { cx } from '@/shared/utils/cx';

const props = defineProps<{
  message: ChatMessage;
}>();

const toast = useToastStore();

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');
const isAssistant = computed(() => props.message.role === 'assistant');

const toolName = computed(() => props.message.meta?.toolName ?? '');

const timeLabel = computed(() =>
  new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(props.message.createdAt)),
);

const renderedHtml = computed(() =>
  isUser.value || isSystem.value
    ? null
    : renderMarkdown(props.message.text),
);

const copy = async () => {
  try {
    await navigator.clipboard.writeText(props.message.text);
    toast.push({ title: 'Copié', tone: 'success', ttlMs: 1800 });
  } catch {
    toast.push({ title: 'Impossible de copier', tone: 'warning' });
  }
};
</script>

<template>
  <div
    class="group flex animate-fade-up gap-3"
    :class="cx(isUser && 'flex-row-reverse')"
  >
    <!-- Avatar -->
    <div class="mt-0.5 shrink-0">
      <div
        class="grid size-8 place-items-center rounded-xl text-xs font-semibold ring-1"
        :class="
          isUser
            ? 'bg-primary/15 ring-primary/25 text-primary'
            : isSystem
              ? 'bg-red-500/10 ring-red-500/20 text-red-300'
              : 'bg-muted/60 ring-border/60 text-muted-foreground'
        "
        aria-hidden="true"
      >
        <span v-if="isUser">U</span>
        <span v-else-if="isSystem">!</span>
        <svg
          v-else
          class="size-4"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" />
          <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
    </div>

    <!-- Content -->
    <div class="min-w-0 max-w-[85%] flex-1" :class="isUser && 'flex flex-col items-end'">
      <!-- Meta row -->
      <div class="mb-1.5 flex items-center gap-2" :class="isUser && 'flex-row-reverse'">
        <span class="text-xs font-medium text-muted-foreground">
          {{ isUser ? 'Toi' : isSystem ? 'Système' : 'Jarvis' }}
        </span>
        <span class="text-[11px] text-muted-foreground/50">{{ timeLabel }}</span>
        <BaseBadge v-if="toolName" tone="info" class="font-mono">
          {{ toolName }}
        </BaseBadge>
      </div>

      <!-- Bubble -->
      <div
        class="rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-soft"
        :class="
          isUser
            ? 'rounded-tr-sm bg-primary/12 ring-1 ring-primary/20 text-foreground'
            : isSystem
              ? 'rounded-tl-sm bg-red-500/8 ring-1 ring-red-500/15 text-red-200'
              : 'rounded-tl-sm border border-border/50 bg-card/80 text-foreground'
        "
      >
        <!-- Markdown for assistant, plain text for others -->
        <div
          v-if="isAssistant && renderedHtml"
          class="prose-chat"
          v-html="renderedHtml"
        />
        <pre v-else class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{
          message.text
        }}</pre>
      </div>

      <!-- Actions -->
      <div
        v-if="isAssistant"
        class="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        <button
          type="button"
          class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          @click="copy"
        >
          <svg class="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="9" height="9" rx="1" />
            <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
          </svg>
          Copier
        </button>
      </div>
    </div>
  </div>
</template>
