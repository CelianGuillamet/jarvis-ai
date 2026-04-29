<script setup lang="ts">
import { cx } from '@/shared/utils/cx';

const props = defineProps<{
  class?: string;
  variant?: 'default' | 'ghost' | 'elevated';
}>();
</script>

<template>
  <div
    :class="
      cx(
        'rounded-2xl border border-border/50 bg-card/70 glass',
        props.variant === 'elevated' && 'shadow-elevated',
        props.variant !== 'ghost' && 'shadow-soft',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
