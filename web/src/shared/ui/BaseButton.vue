<script setup lang="ts">
import { computed } from 'vue';
import { cx } from '@/shared/utils/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    type: 'button',
  },
);

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 select-none';

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
};

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97] active:brightness-95',
  secondary:
    'bg-muted text-foreground hover:bg-muted/70 active:scale-[0.97]',
  ghost:
    'bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-[0.97]',
  danger:
    'bg-red-500/15 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/25 active:scale-[0.97]',
};

const classes = computed(() =>
  cx(base, sizes[props.size], variants[props.variant]),
);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : 'false'"
    :class="classes"
  >
    <span
      v-if="loading"
      class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
