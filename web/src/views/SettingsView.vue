<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import BaseBadge from "@/shared/ui/BaseBadge.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import type { AccountProfile } from "@/core/api/account";
import { useAppStore } from "@/stores/appStore";
import { useStatusStore } from "@/stores/statusStore";

const app = useAppStore();
const status = useStatusStore();

const account = ref<AccountProfile | null>(null);
const accountError = ref("");
const disconnectBusy = ref(false);
const notice = ref("");

onMounted(async () => {
  await Promise.all([status.refresh(), loadAccount()]);
});

async function loadAccount() {
  accountError.value = "";
  try { account.value = await app.jarvis.account(); }
  catch { accountError.value = "Impossible de charger votre compte. Réessayez."; }
}

async function disconnectGoogle() {
  disconnectBusy.value = true;
  notice.value = "";
  try {
    const result = await app.jarvis.disconnectGoogle();
    notice.value = result.revocationPending
      ? "L’accès de Jarvis est retiré. Terminez la révocation dans les autorisations de votre compte Google."
      : "Google est déconnecté. Votre compte Jarvis reste accessible.";
    await status.refresh();
  } catch { notice.value = "La déconnexion ne peut pas être confirmée. Vérifiez l’état avant de réessayer."; }
  finally { disconnectBusy.value = false; }
}

const googleConnected = computed(
  () => status.snapshot?.integrations.googleConnected ?? false,
);

const connectGoogle = () => {
  const url = app.jarvis.googleAuthUrl(app.sessionId);
  window.open(url, "_blank", "noopener,noreferrer");
};

const toggleTheme = () => {
  app.theme = app.theme === "dark" ? "light" : "dark";
};
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <header
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 glass px-5 py-4 shadow-soft"
    >
      <div>
        <h1 class="text-base font-semibold tracking-tight">Réglages</h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Votre compte, vos services connectés et vos préférences.
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
          <path
            d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
          />
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
        {{ app.theme === "dark" ? "Clair" : "Sombre" }}
      </BaseButton>
    </header>

    <BaseCard class="p-5">
      <h2 class="font-semibold">Votre compte</h2>
      <template v-if="account">
        <p class="mt-2">{{ account.name || "Compte invité" }}</p>
        <p class="text-sm text-muted-foreground">{{ account.email }}</p>
        <p class="mt-3 text-sm text-muted-foreground">Votre invitation donne accès à la bêta privée. La connexion à Jarvis est distincte de l’autorisation d’accéder à Gmail et à Google Agenda.</p>
      </template>
      <p v-else-if="accountError" role="alert">{{ accountError }}</p>
      <p v-else role="status">Chargement du compte…</p>
      <BaseButton v-if="accountError" variant="secondary" @click="loadAccount">Réessayer</BaseButton>
    </BaseCard>

    <!-- Google integration -->
    <BaseCard class="p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p
            class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50"
          >
            Intégration Google
          </p>
          <p class="mt-1 text-xs text-muted-foreground/60">
            Autorisez séparément Gmail et Google Agenda pour utiliser ces services.
            Vous pouvez retirer cet accès à tout moment ; vos tâches locales restent disponibles.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <BaseBadge :tone="googleConnected ? 'ok' : 'warn'" :dot="true">
              Google {{ googleConnected ? "connecté" : "non connecté" }}
            </BaseBadge>
            <BaseBadge
              :tone="
                status.snapshot?.integrations.calendarConnected ? 'ok' : 'muted'
              "
              :dot="true"
            >
              Google Agenda
            </BaseBadge>
            <BaseBadge
              :tone="
                status.snapshot?.integrations.gmailConnected ? 'ok' : 'muted'
              "
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
            {{ googleConnected ? "Reconnecter Google" : "Connecter Google" }}
          </BaseButton>
          <BaseButton v-if="googleConnected" variant="danger" size="sm" :loading="disconnectBusy" @click="disconnectGoogle">Déconnecter Google</BaseButton>
        </div>
      </div>
      <p v-if="notice" class="mt-3 text-sm" role="status">{{ notice }}</p>
      <a v-if="notice" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" class="underline">Gérer les autorisations Google</a>
    </BaseCard>
  </section>
</template>
