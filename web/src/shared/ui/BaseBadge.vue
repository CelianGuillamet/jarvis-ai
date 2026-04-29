<script setup lang="ts">
import { computed } from 'vue';
import { cx } from '@/shared/utils/cx';

type Tone = 'default' | 'ok' | 'warn' | 'critical' | 'info' | 'muted';

const props = withDefaults(
  defineProps<{
    tone?: Tone;
    dot?: boolean;
  }>(),
  { tone: 'default', dot: false },
);

const base =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none';

const tones: Record<Tone, string> = {
  default: 'border-border/60 bg-muted/50 text-foreground/80',
  ok: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  critical: 'border-red-500/25 bg-red-500/10 text-red-300',
  info: 'border-primary/25 bg-primary/10 text-primary',
  muted: 'border-transparent bg-muted/40 text-muted-foreground',
};

const dotColors: Record<Tone, string> = {
  default: 'bg-foreground/40',
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  critical: 'bg-red-400',
  info: 'bg-primary',
  muted: 'bg-muted-foreground/50',
};

const classes = computed(() => cx(base, tones[props.tone]));
</script>

<template>
  <span :class="classes">
    <span
      v-if="dot"
      class="size-1.5 rounded-full"
      :class="dotColors[props.tone]"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>
