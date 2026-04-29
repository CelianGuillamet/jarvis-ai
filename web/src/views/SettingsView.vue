<script setup lang="ts">
import { computed, onMounted } from 'vue';

import BaseBadge from '@/shared/ui/BaseBadge.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import BaseCard from '@/shared/ui/BaseCard.vue';
import BaseInput from '@/shared/ui/BaseInput.vue';
import { useAppStore } from '@/stores/appStore';
import { useStatusStore } from '@/stores/statusStore';

const app = useAppStore();
const status = useStatusStore();

onMounted(async () => {
  await status.refresh();
});

const googleConnected = computed(
  () => status.snapshot?.integrations.googleConnected ?? false,
);

const timeoutMsText = computed({
  get: () => String(app.timeoutMs),
  set: (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 1_000) return;
    app.timeoutMs = Math.floor(next);
  },
});

const timeoutError = computed(() => {
  const n = Number(timeoutMsText.value);
  if (!Number.isFinite(n)) return 'Valeur invalide.';
  if (n < 1_000) return 'Minimum 1 000 ms.';
  if (n > 300_000) return 'Maximum conseillé : 300 000 ms.';
  return '';
});

const connectGoogle = () => {
  const url = app.jarvis.googleAuthUrl(app.sessionId);
  window.open(url, '_blank', 'noopener,noreferrer');
};

const toggleTheme = () => {
  app.theme = app.theme === 'dark' ? 'light' : 'dark';
};
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <header
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 glass px-5 py-4 shadow-soft"
    >
      <div>
        <h1 class="text-base font-semibold tracking-tight">Settings</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Session, API, intégrations Google, et préférences.
        </p>
      </div>
      <BaseButton variant="ghost" size="sm" @click="toggleTheme">
        <svg
          v-if="app.theme === 'dark'"
          class="size-4"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        >
          <circle cx="10" cy="10" r="4" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
        </svg>
        <svg
          v-else
          class="size-4"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        >
          <path d="M17.5 12A7.5 7.5 0 0 1 8 2.5a7.5 7.5 0 1 0 9.5 9.5z" />
        </svg>
        {{ app.theme === 'dark' ? 'Clair' : 'Sombre' }}
      </BaseButton>
    </header>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Session -->
      <BaseCard class="p-5">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Session
        </p>
        <p class="mt-1 text-xs text-muted-foreground/60">
          Une session par humain ou usage. Isole les mémoires et le contexte.
        </p>
        <div class="mt-4">
          <BaseInput
            v-model="app.sessionId"
            label="Session ID"
            placeholder="default"
            hint="Ex : alice, demo, prod-user-42"
          />
        </div>
      </BaseCard>

      <!-- Réseau -->
      <BaseCard class="p-5">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Réseau & Auth
        </p>
        <p class="mt-1 text-xs text-muted-foreground/60">
          Vide = même origin. Configure pour pointer vers une instance distante.
        </p>
        <div class="mt-4 space-y-3">
          <BaseInput
            v-model="app.apiBaseUrl"
            label="API base URL"
            placeholder="http://localhost:3000"
            hint="Optionnel — vide = même origin."
          />
          <BaseInput
            v-model="app.authToken"
            label="Auth token"
            type="password"
            placeholder="—"
            hint="Futur Bearer token. Optionnel pour l'instant."
          />
          <BaseInput
            v-model="timeoutMsText"
            label="Timeout (ms)"
            type="number"
            :error="timeoutError"
            hint="Augmente pour les requêtes LLM longues (ex : 60 000)."
          />
        </div>
      </BaseCard>
    </div>

    <!-- Google integration -->
    <BaseCard class="p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Intégration Google
          </p>
          <p class="mt-1 text-xs text-muted-foreground/60">
            Requis pour exécuter
            <code class="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px]">calendar.*</code>
            et
            <code class="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px]">gmail.*</code>
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <BaseBadge :tone="googleConnected ? 'ok' : 'warn'" :dot="true">
              Google {{ googleConnected ? 'connecté' : 'non connecté' }}
            </BaseBadge>
            <BaseBadge
              :tone="status.snapshot?.integrations.calendarConnected ? 'ok' : 'muted'"
              :dot="true"
            >
              Calendar
            </BaseBadge>
            <BaseBadge
              :tone="status.snapshot?.integrations.gmailConnected ? 'ok' : 'muted'"
              :dot="true"
            >
              Gmail
            </BaseBadge>
          </div>
        </div>
        <div class="flex shrink-0 gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            :loading="status.busy"
            @click="status.refresh"
          >
            Rafraîchir
          </BaseButton>
          <BaseButton variant="primary" size="sm" @click="connectGoogle">
            Connecter Google
          </BaseButton>
        </div>
      </div>
    </BaseCard>
  </section>
</template>
