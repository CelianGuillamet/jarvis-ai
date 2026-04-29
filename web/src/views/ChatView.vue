<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useChatStore } from '@/stores/chatStore';
import { useStatusStore } from '@/stores/statusStore';
import BaseCard from '@/shared/ui/BaseCard.vue';
import BaseSkeleton from '@/shared/ui/BaseSkeleton.vue';
import ChatComposer from '@/features/chat/components/ChatComposer.vue';
import ChatMessageItem from '@/features/chat/components/ChatMessageItem.vue';
import PendingActionCard from '@/features/chat/components/PendingActionCard.vue';

const chat = useChatStore();
const status = useStatusStore();

const listRef = ref<HTMLDivElement | null>(null);
const stickToBottom = ref(true);

const scrollToBottom = async () => {
  await nextTick();
  const el = listRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
};

const onScroll = () => {
  const el = listRef.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
};

watch(
  () => chat.messages.length,
  async () => {
    if (stickToBottom.value) await scrollToBottom();
  },
);

onMounted(async () => {
  await status.refresh();
});

const examplePrompts = [
  'Fais mon briefing du jour',
  "Mon agenda d'aujourd'hui",
  'Météo demain à Paris',
  'Résume mes emails',
  'Liste mes todos',
];
</script>

<template>
  <section class="flex h-[calc(100dvh-2rem)] flex-col gap-3">
    <!-- Header -->
    <header class="shrink-0 rounded-2xl border border-border/50 bg-card/60 glass px-5 py-4 shadow-soft">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-base font-semibold tracking-tight">Chat</h1>
          <p class="mt-0.5 text-sm text-muted-foreground">
            Dialogue naturel, confirmations, et exécution outillée.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            v-if="chat.busy"
            class="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            <span class="size-1.5 animate-pulse rounded-full bg-primary" />
            Traitement…
          </span>
        </div>
      </div>
    </header>

    <!-- Chat + sidebar -->
    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_300px]">
      <!-- Chat panel -->
      <BaseCard class="flex min-h-0 flex-col overflow-hidden">
        <!-- Messages list -->
        <div
          ref="listRef"
          class="flex-1 overflow-y-auto px-5 py-4"
          @scroll="onScroll"
        >
          <!-- Empty state -->
          <div
            v-if="!chat.messages.length"
            class="flex h-full flex-col items-center justify-center"
          >
            <div class="mx-auto max-w-sm text-center">
              <div
                class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-muted ring-1 ring-primary/20"
              >
                <span class="text-2xl font-bold text-gradient">J</span>
              </div>
              <h2 class="text-base font-semibold tracking-tight">Que puis-je faire pour toi ?</h2>
              <p class="mt-1.5 text-sm text-muted-foreground">
                Jarvis détecte tes intentions, propose une prévisualisation et exécute après confirmation.
              </p>
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  v-for="prompt in examplePrompts"
                  :key="prompt"
                  type="button"
                  class="rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                  @click="chat.send(prompt)"
                >
                  {{ prompt }}
                </button>
              </div>
            </div>
          </div>

          <!-- Messages -->
          <TransitionGroup v-else tag="div" name="msg" class="space-y-5">
            <ChatMessageItem
              v-for="m in chat.messages"
              :key="m.id"
              :message="m"
            />
          </TransitionGroup>

          <!-- Thinking indicator -->
          <div v-if="chat.busy && chat.messages.length" class="mt-5 flex gap-3">
            <div
              class="grid size-8 shrink-0 place-items-center rounded-xl bg-muted/60 ring-1 ring-border/60"
              aria-hidden="true"
            >
              <svg class="size-4 text-muted-foreground" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8z" />
                <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div
              class="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border/50 bg-card/80 px-4 py-3"
              aria-label="Jarvis réfléchit"
            >
              <span
                v-for="i in 3"
                :key="i"
                class="size-1.5 rounded-full bg-muted-foreground animate-dot"
                :style="`animation-delay: ${(i - 1) * 0.18}s`"
                aria-hidden="true"
              />
            </div>
          </div>

          <!-- Loading skeletons (first load) -->
          <div v-if="chat.busy && !chat.messages.length" class="space-y-4 pt-4">
            <BaseSkeleton class="h-4 w-2/5" />
            <BaseSkeleton class="h-24 w-full" />
          </div>
        </div>

        <!-- Composer area -->
        <div class="shrink-0 border-t border-border/40 bg-background/30 p-4">
          <PendingActionCard
            class="mb-3"
            :pending-action="chat.pendingAction"
            :awaiting="chat.lastMeta?.awaiting ?? null"
            :gated-tool="chat.lastMeta?.gatedTool ?? null"
            :busy="chat.busy"
            @confirm="chat.confirmPending"
            @cancel="chat.cancelPending"
            @connect-google="chat.openGoogleConnect"
          />
          <ChatComposer
            :busy="chat.busy"
            :choices="chat.choices"
            @send="chat.send"
            @abort="chat.abort"
          />
        </div>
      </BaseCard>

      <!-- Sidebar -->
      <aside class="hidden space-y-3 lg:flex lg:flex-col">
        <!-- Quick actions -->
        <BaseCard class="p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Actions rapides
          </p>
          <div v-if="status.busy && !status.snapshot" class="mt-3 space-y-2">
            <BaseSkeleton class="h-8 w-full" />
            <BaseSkeleton class="h-8 w-full" />
            <BaseSkeleton class="h-8 w-3/4" />
          </div>
          <div v-else class="mt-3 space-y-1.5">
            <button
              v-for="qa in status.snapshot?.quickActions ?? []"
              :key="qa.title"
              type="button"
              class="flex w-full items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-left text-xs transition hover:bg-muted/50 hover:border-border/70 disabled:opacity-50"
              :disabled="!qa.enabled || (!qa.prompt && !qa.href)"
              @click="qa.prompt ? chat.send(qa.prompt) : undefined"
            >
              <span class="font-medium">{{ qa.title }}</span>
              <span v-if="qa.badge" class="text-muted-foreground/60">{{ qa.badge }}</span>
            </button>
            <div
              v-if="!(status.snapshot?.quickActions?.length)"
              class="py-2 text-center text-xs text-muted-foreground/50"
            >
              Aucune action disponible
            </div>
          </div>
        </BaseCard>

        <!-- Suggestions rapides -->
        <BaseCard class="p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Raccourcis
          </p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <button
              v-for="prompt in examplePrompts"
              :key="prompt"
              type="button"
              class="rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-xs text-foreground/70 transition hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
              @click="chat.send(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
        </BaseCard>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.msg-enter-active {
  animation: fade-up 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
