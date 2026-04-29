<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue';

import { createId } from '@/shared/utils/ids';
import { cx } from '@/shared/utils/cx';

defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ required: true });
const attrs = useAttrs();

const props = withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    error?: string;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    textareaClass?: string;
  }>(),
  {
    disabled: false,
    rows: 3,
  },
);

const fallbackId = ref(createId('textarea'));
const inputId = computed(() => props.id?.trim() || fallbackId.value);
const describedBy = computed(() => {
  const ids: string[] = [];
  if (props.hint) ids.push(`${inputId.value}-hint`);
  if (props.error) ids.push(`${inputId.value}-error`);
  return ids.length ? ids.join(' ') : undefined;
});
</script>

<template>
  <div class="space-y-1.5">
    <label v-if="label" :for="inputId" class="text-xs font-medium text-muted-foreground">
      {{ label }}
    </label>
    <textarea
      :id="inputId"
      v-model="model"
      :rows="rows"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-invalid="error ? 'true' : 'false'"
      :aria-describedby="describedBy"
      v-bind="attrs"
      :class="
        cx(
          'min-h-[44px] w-full resize-y rounded-lg border bg-background/40 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-border focus:ring-2 focus:ring-ring/40 disabled:opacity-60',
          error ? 'border-red-500/40 focus:ring-red-500/30' : 'border-border/60',
          textareaClass,
        )
      "
    />
    <p v-if="hint" :id="`${inputId}-hint`" class="text-xs text-muted-foreground">
      {{ hint }}
    </p>
    <p v-if="error" :id="`${inputId}-error`" class="text-xs text-red-200">
      {{ error }}
    </p>
  </div>
</template>
