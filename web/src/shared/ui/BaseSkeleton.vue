<script setup lang="ts">
import { cx } from '@/shared/utils/cx';

const props = defineProps<{
  class?: string;
}>();
</script>

<template>
  <div
    :class="cx('relative overflow-hidden rounded-lg bg-muted/50', props.class || 'h-4 w-full')"
  >
    <div class="shimmer absolute inset-0" />
  </div>
</template>
