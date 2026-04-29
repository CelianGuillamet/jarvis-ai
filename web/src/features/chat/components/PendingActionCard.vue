<script setup lang="ts">
import { computed } from 'vue';
import type { PendingActionView } from '@/core/types/jarvis';
import BaseBadge from '@/shared/ui/BaseBadge.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';

const props = defineProps<{
  pendingAction: PendingActionView | null;
  awaiting?: string | null;
  gatedTool?: string | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
  connectGoogle: [];
}>();

const riskTone = computed((): 'critical' | 'warn' | 'ok' => {
  const risk = props.pendingAction?.risk;
  if (risk === 'high') return 'critical';
  if (risk === 'medium') return 'warn';
  return 'ok';
});

const showConnectGoogle = computed(() => props.awaiting === 'connect_google');

const riskBorder = computed(() => {
  const risk = props.pendingAction?.risk;
  if (risk === 'high') return 'border-red-500/25';
  if (risk === 'medium') return 'border-amber-500/25';
  return 'border-emerald-500/20';
});
</script>

<template>
  <div v-if="pendingAction || showConnectGoogle" class="space-y-2">
    <!-- Pending action -->
    <div
      v-if="pendingAction"
      class="animate-scale-in rounded-2xl border bg-card/80 glass shadow-soft"
      :class="riskBorder"
    >
      <div class="px-4 pt-4">
        <div class="flex items-start gap-3">
          <!-- Risk indicator -->
          <div
            class="mt-0.5 shrink-0 rounded-lg p-2"
            :class="
              pendingAction.risk === 'high'
                ? 'bg-red-500/10 text-red-400'
                : pendingAction.risk === 'medium'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-400'
            "
          >
            <svg class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="pendingAction.risk === 'high'" d="M10 3L2 17h16L10 3zM10 11V7M10 14v.5" />
              <path v-else-if="pendingAction.risk === 'medium'" d="M10 10V6M10 13v.5M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2z" />
              <path v-else d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zM7 10l2 2 4-4" />
            </svg>
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-muted-foreground">Action en attente</p>
            <p class="mt-0.5 text-sm font-semibold tracking-tight">
              {{ pendingAction.summary }}
            </p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <BaseBadge :tone="riskTone" :dot="true">
                risque {{ pendingAction.risk }}
              </BaseBadge>
              <BaseBadge :tone="pendingAction.sideEffect ? 'warn' : 'muted'">
                {{ pendingAction.sideEffect ? 'effet réel' : 'lecture seule' }}
              </BaseBadge>
              <BaseBadge v-if="pendingAction.planner" tone="muted" class="font-mono">
                {{ pendingAction.planner }}
              </BaseBadge>
            </div>
          </div>
        </div>

        <!-- Preview block -->
        <div
          v-if="pendingAction.preview"
          class="mt-3 rounded-xl border border-border/40 bg-muted/30 p-3"
        >
          <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Aperçu
          </p>
          <pre class="overflow-x-auto font-mono text-xs text-muted-foreground">{{ pendingAction.preview }}</pre>
        </div>

        <p v-if="pendingAction.confirmationReason" class="mt-2 text-xs text-muted-foreground/70">
          {{ pendingAction.confirmationReason }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 px-4 py-3">
        <BaseButton variant="primary" :loading="!!busy" @click="emit('confirm')">
          Confirmer
        </BaseButton>
        <BaseButton variant="ghost" size="sm" :disabled="!!busy" @click="emit('cancel')">
          Annuler
        </BaseButton>
      </div>
    </div>

    <!-- Google auth gate -->
    <div
      v-if="showConnectGoogle"
      class="animate-scale-in rounded-2xl border border-amber-500/25 bg-amber-500/5 glass p-4"
    >
      <div class="flex items-start gap-3">
        <div class="shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-400">
          <svg class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10" cy="10" r="8" />
            <path d="M10 6v4l3 3" />
          </svg>
        </div>
        <div class="flex-1">
          <p class="text-sm font-semibold text-amber-200">Connexion Google requise</p>
          <p class="mt-1 text-xs text-amber-200/70">
            Calendar et Gmail doivent être connectés pour exécuter cette action.
            <span v-if="gatedTool" class="font-mono">Outil bloqué : {{ gatedTool }}</span>
          </p>
          <div class="mt-3">
            <BaseButton variant="secondary" size="sm" :disabled="!!busy" @click="emit('connectGoogle')">
              Connecter Google
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
