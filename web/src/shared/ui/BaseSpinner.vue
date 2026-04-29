<script setup lang="ts">
import { computed } from 'vue';

import { cx } from '@/shared/utils/cx';

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  }>(),
  { size: 'md' },
);

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'size-4 border-2';
    case 'lg':
      return 'size-7 border-[3px]';
    default:
      return 'size-5 border-2';
  }
});
</script>

<template>
  <span
    role="status"
    aria-label="Chargement"
    :class="
      cx(
        'inline-block animate-spin rounded-full border-current border-t-transparent opacity-80',
        sizeClass,
        props.class,
      )
    "
  />
</template>

