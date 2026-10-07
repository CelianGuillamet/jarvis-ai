<script setup lang="ts">
import AccountDataControls from "@/features/privacy/AccountDataControls.vue";
import AccountPrivacyCard from "@/features/privacy/AccountPrivacyCard.vue";
import PersonalMemoryCard from "@/features/memory/PersonalMemoryCard.vue";
import { computed, onMounted, ref, watch } from "vue";

import { TimezoneSchema } from "@/core/contracts/v1";
import BaseBadge from "@/shared/ui/BaseBadge.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseInput from "@/shared/ui/BaseInput.vue";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { AccountProfile } from "@/core/api/account";
import { useAppStore } from "@/stores/appStore";
import { useStatusStore } from "@/stores/statusStore";

const props = defineProps<{ onboarding?: boolean }>();
const preferences = usePreferencesStore();
const displayTimezone = ref(
  preferences.current?.displayTimezone || "Europe/Paris",
);
const selectedTheme = ref<"light" | "dark">(
  preferences.current?.theme || "dark",
);
const saved = ref(false);
const timezoneError = computed(() =>
  TimezoneSchema.safeParse(displayTimezone.value).success
    ? ""
    : "Indiquez un fuseau valide, par exemple Europe/Paris.",
);
watch([displayTimezone, selectedTheme], () => {
  saved.value = false;
});
async function savePreferences(complete = false) {
  if (timezoneError.value) return;
  saved.value = await preferences.save({
    displayTimezone: displayTimezone.value,
    theme: selectedTheme.value,
    onboardingCompleted:
      complete || preferences.current?.onboardingCompleted || false,
  });
}

const app = useAppStore();
const status = useStatusStore();

const account = ref<AccountProfile | null>(null);
const accountError = ref("");
const disconnectBusy = ref(false);
const notice = ref("");

onMounted(async () => {
  await Promise.all([status.refresh(), loadAccount()]);
});

function leaveAfterDeletion() {
  // A full navigation drops private view state and pending reads after acceptance.
  window.location.assign(
    new URL(
      "deletion-status",
      new URL(import.meta.env.BASE_URL || "/", window.location.origin),
    ).href,
  );
}

async function loadAccount() {
  accountError.value = "";
  try {
    account.value = await app.jarvis.account();
  } catch {
    accountError.value = "Impossible de charger votre compte. Réessayez.";
  }
}

async function disconnectGoogle() {
  disconnectBusy.value = true;
  notice.value = "";
  try {
    const result = await app.jarvis.disconnectGoogle();
    notice.value = result.revocationPending
      ? "L’accès de Jarvis est retiré. Terminez la révocation dans les autorisations de votre compte Google."
      : "Google est déconnecté. Votre compte Jarvis reste accessible.";
    // The confirmed local revocation is authoritative even if status refresh fails.
    if (status.snapshot) {
      status.snapshot.integrations.googleConnected = false;
      status.snapshot.integrations.gmailConnected = false;
    }
    await status.refresh();
  } catch {
    notice.value =
      "La déconnexion ne peut pas être confirmée. Vérifiez l’état avant de réessayer.";
  } finally {
    disconnectBusy.value = false;
  }
}

const googleConnected = computed(
  () => status.snapshot?.integrations.googleConnected ?? false,
);

const connectGoogle = () => {
  const url = app.jarvis.googleAuthUrl(app.sessionId);
  window.open(url, "_blank", "noopener,noreferrer");
};
</script>

<template>
  <section class="space-y-4">
    <!-- Header -->
    <header
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 glass px-5 py-4 shadow-soft"
    >
      <div>
        <h1 class="text-base font-semibold tracking-tight">
          {{ props.onboarding ? "Bienvenue dans Jarvis" : "Réglages" }}
        </h1>
        <p class="mt-0.5 text-sm text-muted-foreground">
          Votre compte, vos services connectés et vos préférences.
        </p>
      </div>
    </header>

    <BaseCard class="p-5">
      <h2 class="font-semibold">Votre compte</h2>
      <template v-if="account">
        <p class="mt-2">{{ account.name || "Compte invité" }}</p>
        <p class="text-sm text-muted-foreground">{{ account.email }}</p>
        <p class="mt-3 text-sm text-muted-foreground">
          Votre invitation donne accès à la bêta privée. La connexion à Jarvis
          est distincte de l’autorisation d’accéder à Gmail et à Google Agenda.
        </p>
      </template>
      <p v-else-if="accountError" role="alert">{{ accountError }}</p>
      <p v-else role="status">Chargement du compte…</p>
      <BaseButton v-if="accountError" variant="secondary" @click="loadAccount"
        >Réessayer</BaseButton
      >
    </BaseCard>

    <BaseCard class="p-5 space-y-3">
      <h2 class="font-semibold">Vos préférences</h2>
      <BaseInput
        v-model="displayTimezone"
        label="Fuseau d’affichage"
        :error="timezoneError"
        placeholder="Europe/Paris"
        hint="Exemple : Europe/Paris ou America/Montreal. Les heures affichées dans la boîte mail utilisent ce fuseau. Les actions de l’assistant restent interprétées dans le fuseau Europe/Paris : précisez l’heure et le fuseau pour un rendez-vous."
      />
      <label class="block text-sm" for="account-theme">Apparence</label>
      <select
        id="account-theme"
        v-model="selectedTheme"
        class="rounded-lg border border-border bg-card p-2"
      >
        <option value="dark">Sombre</option>
        <option value="light">Claire</option>
      </select>
      <p v-if="preferences.error" role="alert">{{ preferences.error }}</p>
      <p v-if="saved" role="status">Préférences enregistrées.</p>
      <BaseButton
        v-if="!props.onboarding"
        :loading="preferences.busy"
        :disabled="Boolean(timezoneError)"
        @click="savePreferences()"
        >Enregistrer les préférences</BaseButton
      >
    </BaseCard>

    <PersonalMemoryCard v-if="!props.onboarding" />
    <AccountPrivacyCard />
    <AccountDataControls
      v-if="!props.onboarding && account"
      :account="account"
      @accepted="leaveAfterDeletion"
    />

    <!-- Google integration -->
    <BaseCard class="p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p
            class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Intégration Google
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            Autorisez séparément Gmail et Google Agenda pour utiliser ces
            services. Vous pouvez retirer cet accès à tout moment ; vos tâches
            locales restent disponibles.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <BaseBadge :tone="googleConnected ? 'ok' : 'warn'" :dot="true">
              Google
              {{
                !status.snapshot
                  ? "à vérifier"
                  : googleConnected
                    ? "connecté"
                    : "non connecté"
              }}
            </BaseBadge>
            <BaseBadge
              :tone="
                googleConnected &&
                status.snapshot?.integrations.calendarConnected
                  ? 'ok'
                  : 'muted'
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
        <div class="flex flex-wrap gap-2">
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
          <BaseButton
            v-if="googleConnected"
            variant="danger"
            size="sm"
            :loading="disconnectBusy"
            @click="disconnectGoogle"
            >Déconnecter Google</BaseButton
          >
        </div>
      </div>
      <p v-if="notice" class="mt-3 text-sm" role="status">{{ notice }}</p>
      <a
        v-if="notice"
        href="https://myaccount.google.com/connections"
        target="_blank"
        rel="noopener noreferrer"
        class="underline"
        >Gérer les autorisations Google</a
      >
    </BaseCard>
    <BaseCard class="p-5 space-y-3">
      <h2 class="font-semibold">Confidentialité et assistance</h2>
      <p class="text-sm text-muted-foreground">
        Votre compte isole vos conversations et vos données. Les autorisations
        Google permettent de consulter vos messages et votre agenda, et
        d’exécuter les actions demandées. Vérifiez les confirmations avant toute
        action sensible.
      </p>
      <p class="text-sm text-muted-foreground">
        Déconnecter Google retire l’accès de Jarvis ; cela ne supprime pas votre
        compte ni les données déjà conservées. Pour demander leur suppression ou
        obtenir de l’aide pendant la bêta, contactez la personne qui vous a
        envoyé votre invitation.
      </p>
      <p class="text-sm text-muted-foreground">
        Indiquez l’écran concerné, l’heure et ce qui s’est passé. Ne transmettez
        ni mot de passe, ni code de connexion, ni contenu privé d’un e-mail.
      </p>
    </BaseCard>
    <BaseCard v-if="props.onboarding" class="p-5 space-y-3">
      <h2 class="font-semibold">Prêt à commencer</h2>
      <p class="text-sm text-muted-foreground">
        Google est facultatif : vous pouvez commencer avec vos tâches locales et
        connecter vos services plus tard dans les réglages.
      </p>
      <BaseButton
        :loading="preferences.busy"
        :disabled="Boolean(timezoneError)"
        @click="savePreferences(true)"
        >Enregistrer et commencer</BaseButton
      >
    </BaseCard>
  </section>
</template>
