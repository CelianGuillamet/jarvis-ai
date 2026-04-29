<script setup lang="ts">
import { useToastStore } from '@/stores/toastStore';
import { cx } from '@/shared/utils/cx';

const toast = useToastStore();

const toneClass = (tone: string): string => {
  switch (tone) {
    case 'success':
      return 'border-emerald-500/30 bg-emerald-950/80 text-emerald-100';
    case 'warning':
      return 'border-amber-500/30 bg-amber-950/80 text-amber-100';
    case 'danger':
      return 'border-red-500/30 bg-red-950/80 text-red-100';
    default:
      return 'border-border/60 bg-card/90 text-foreground';
  }
};

const iconPath = (tone: string): string => {
  switch (tone) {
    case 'success':
      return 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
    case 'warning':
      return 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z';
    case 'danger':
      return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
    default:
      return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
  }
};
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto flex w-full max-w-sm flex-col gap-2 px-4"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      <TransitionGroup name="toast">
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="pointer-events-auto rounded-xl border glass shadow-elevated"
          :class="cx(toneClass(item.tone))"
        >
          <div class="flex items-start gap-3 p-3">
            <svg
              class="mt-0.5 size-4 shrink-0 opacity-80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="iconPath(item.tone)" />
            </svg>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold leading-snug">{{ item.title }}</p>
              <p v-if="item.detail" class="mt-0.5 text-xs opacity-75">
                {{ item.detail }}
              </p>
            </div>
            <button
              type="button"
              class="ml-1 shrink-0 rounded-md p-1 opacity-50 transition-opacity hover:opacity-100"
              aria-label="Fermer"
              @click="toast.dismiss(item.id)"
            >
              <svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path
                  d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"
                />
              </svg>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  animation: slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-leave-active {
  animation: fade-out 0.18s ease forwards;
}
.toast-move {
  transition: transform 0.2s ease;
}

@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-12px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>
