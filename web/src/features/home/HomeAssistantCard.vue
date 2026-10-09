<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import { useAppStore } from "@/stores/appStore";
import type { HomeStatus } from "@/core/contracts/v1";

const app = useAppStore();
const status = ref<HomeStatus | null>(null);
const discovered = ref<HomeStatus["entities"] | null>(null);
const selected = ref<Set<string>>(new Set());
const baseUrl = ref("");
const token = ref("");
const error = ref("");
const result = ref("");
const busy = ref(false);
const confirmingDisconnect = ref(false);
let alive = true;

async function load() {
  error.value = "";
  try {
    const next = await app.jarvis.homeStatus();
    if (!alive) return;
    status.value = next;
    selected.value = new Set(next.entities.map(entity => entity.entityId));
  } catch {
    if (alive) error.value = "Impossible de lire l’état de Home Assistant. Réessayez.";
  }
}

async function run(action: () => Promise<void>, done: string, failure: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  result.value = "";
  try {
    await action();
    result.value = done;
  } catch {
    error.value = failure;
  } finally {
    busy.value = false;
  }
}

function connect() {
  const address = baseUrl.value.trim();
  const secret = token.value.trim();
  if (!address || !secret) return;
  void run(async () => {
    status.value = await app.jarvis.homeConnect(address, secret);
    token.value = "";
    discovered.value = null;
    selected.value = new Set();
  }, "Home Assistant est connecté. Choisissez maintenant les appareils accessibles.",
  "Connexion refusée. Vérifiez l’adresse (réseau local uniquement), le port 8123 et le jeton.");
}

function discover() {
  void run(async () => {
    discovered.value = (await app.jarvis.homeDiscover()).entities;
  }, "Appareils trouvés.", "Impossible de lister les appareils. Vérifiez la connexion.");
}

function toggle(entityId: string, checked: boolean) {
  const next = new Set(selected.value);
  if (checked) next.add(entityId);
  else next.delete(entityId);
  selected.value = next;
}

function save() {
  void run(async () => {
    status.value = await app.jarvis.homeSetEntities([...selected.value]);
  }, "Sélection enregistrée. Jarvis ne voit que ces appareils.", "La sélection n’a pas été enregistrée (50 appareils maximum).");
}

function disconnect() {
  void run(async () => {
    status.value = await app.jarvis.homeDisconnect();
    discovered.value = null;
    selected.value = new Set();
    confirmingDisconnect.value = false;
  }, "Home Assistant est déconnecté et le jeton a été supprimé.", "La déconnexion n’a pas pu être confirmée. Actualisez.");
}

onMounted(load);
onUnmounted(() => {
  alive = false;
});
</script>

<template>
  <BaseCard class="space-y-4 p-5" aria-labelledby="home-title">
    <div>
      <h2 id="home-title" class="font-semibold">Maison (Home Assistant)</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Jarvis peut lire des lumières et des capteurs, puis allumer ou éteindre une lumière ou activer une scène
        après votre confirmation. Il n’accède qu’aux appareils que vous cochez, sur votre réseau local.
      </p>
    </div>
    <p v-if="error" role="alert" class="text-sm">{{ error }}</p>
    <p v-if="result" role="status" class="text-sm">{{ result }}</p>
    <BaseButton v-if="error && !status" variant="secondary" size="sm" @click="load">Réessayer</BaseButton>
    <p v-else-if="!status" role="status" class="text-sm">Lecture de l’intégration…</p>
    <p v-else-if="!status.enabled" class="text-sm text-muted-foreground">
      Cette intégration est désactivée sur ce serveur (HOME_ASSISTANT_ENABLED).
    </p>

    <template v-else-if="!status.connected">
      <form class="space-y-2" @submit.prevent="connect">
        <label for="home-url" class="text-sm font-medium">Adresse locale</label>
        <input id="home-url" v-model="baseUrl" type="url" placeholder="http://homeassistant.local:8123" autocomplete="off"
          class="w-full rounded-lg border border-input bg-background p-2 text-sm" />
        <label for="home-token" class="text-sm font-medium">Jeton d’accès longue durée</label>
        <input id="home-token" v-model="token" type="password" autocomplete="off"
          class="w-full rounded-lg border border-input bg-background p-2 text-sm" aria-describedby="home-token-hint" />
        <p id="home-token-hint" class="text-xs text-muted-foreground">
          Créez-le dans votre profil Home Assistant. Il est chiffré, jamais réaffiché, et supprimé à la déconnexion.
        </p>
        <BaseButton type="submit" size="sm" :loading="busy" :disabled="!baseUrl.trim() || !token.trim()">Connecter</BaseButton>
      </form>
    </template>

    <template v-else>
      <p class="text-sm">Connecté à <strong>{{ status.baseUrl }}</strong> · {{ status.entities.length }} appareil(s) autorisé(s).</p>
      <ul v-if="status.entities.length" class="text-sm" aria-label="Appareils autorisés">
        <li v-for="entity in status.entities" :key="entity.entityId">{{ entity.label }} <span class="text-xs text-muted-foreground">({{ entity.entityId }})</span></li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <BaseButton size="sm" variant="secondary" :loading="busy" @click="discover">Choisir les appareils</BaseButton>
      </div>
      <fieldset v-if="discovered" class="space-y-1">
        <legend class="text-sm font-medium">Appareils accessibles à Jarvis</legend>
        <label v-for="entity in discovered" :key="entity.entityId" class="flex items-center gap-2 text-sm">
          <input type="checkbox" :checked="selected.has(entity.entityId)" :aria-label="`${entity.label} (${entity.entityId})`"
            @change="toggle(entity.entityId, ($event.target as HTMLInputElement).checked)" />
          {{ entity.label }} <span class="text-xs text-muted-foreground">({{ entity.entityId }})</span>
        </label>
        <BaseButton size="sm" :loading="busy" @click="save">Enregistrer la sélection</BaseButton>
      </fieldset>
      <div v-if="confirmingDisconnect" class="flex flex-wrap items-center gap-2">
        <span class="text-sm">Supprimer le jeton et l’accès de Jarvis à la maison ?</span>
        <BaseButton size="sm" variant="danger" :loading="busy" @click="disconnect">Confirmer la déconnexion</BaseButton>
        <BaseButton size="sm" variant="secondary" :disabled="busy" @click="confirmingDisconnect = false">Annuler</BaseButton>
      </div>
      <BaseButton v-else size="sm" variant="secondary" :disabled="busy" @click="confirmingDisconnect = true">Déconnecter</BaseButton>
    </template>
  </BaseCard>
</template>
