<script setup lang="ts">
import { onMounted, ref } from "vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import { useAppStore } from "@/stores/appStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { PersonalFact } from "@/core/contracts/v1";

const MAX_LENGTH = 280;
const REVIEW_AFTER_MS = 180 * 86_400_000;
const app = useAppStore();
const preferences = usePreferencesStore();
const facts = ref<PersonalFact[] | null>(null);
const error = ref("");
const result = ref("");
const busy = ref(false);
const draft = ref("");
const editingId = ref<string | null>(null);
const editText = ref("");
const forgettingId = ref<string | null>(null);

function stale(fact: PersonalFact) {
  return Date.now() - Date.parse(fact.updatedAt) > REVIEW_AFTER_MS;
}

async function run(action: () => Promise<void>, done: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  result.value = "";
  try {
    await action();
    result.value = done;
  } catch {
    error.value = "L’action n’a pas pu être confirmée. Rechargez la liste avant de réessayer.";
  } finally {
    busy.value = false;
  }
}

async function load() {
  error.value = "";
  try {
    facts.value = (await app.jarvis.personalFacts()).facts;
  } catch {
    error.value = "Impossible de lire votre mémoire. Réessayez.";
  }
}

function add() {
  const text = draft.value.trim();
  if (!text) return;
  void run(async () => {
    await app.jarvis.addPersonalFact(text);
    draft.value = "";
    await load();
  }, "Fait enregistré.");
}

function startEdit(fact: PersonalFact) {
  editingId.value = fact.id;
  editText.value = fact.text;
  forgettingId.value = null;
}

function saveEdit(id: string) {
  const text = editText.value.trim();
  if (!text) return;
  void run(async () => {
    await app.jarvis.updatePersonalFact(id, text);
    editingId.value = null;
    await load();
  }, "Fait corrigé.");
}

function forget(id: string) {
  void run(async () => {
    facts.value = (await app.jarvis.forgetPersonalFact(id)).facts;
    forgettingId.value = null;
  }, "Fait oublié. Jarvis ne l’utilisera plus.");
}

onMounted(load);
</script>

<template>
  <BaseCard class="space-y-4 p-5" aria-labelledby="memory-title">
    <div>
      <h2 id="memory-title" class="font-semibold">Mémoire personnelle</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Jarvis ne retient que ce que vous approuvez : ici, ou en disant « Retiens que… » puis en confirmant.
        Ces faits valent pour tout votre compte et servent de contexte, jamais d’instructions.
      </p>
    </div>

    <form class="space-y-2" @submit.prevent="add">
      <label for="memory-new" class="text-sm font-medium">Nouveau fait</label>
      <textarea
        id="memory-new"
        v-model="draft"
        :maxlength="MAX_LENGTH"
        rows="2"
        class="w-full rounded-lg border border-input bg-background p-2 text-sm"
        aria-describedby="memory-new-hint"
      />
      <p id="memory-new-hint" class="text-xs text-muted-foreground">
        {{ draft.length }}/{{ MAX_LENGTH }} caractères. Exemple : « Je préfère les réunions le matin ».
      </p>
      <BaseButton type="submit" size="sm" :loading="busy" :disabled="!draft.trim()">Retenir</BaseButton>
    </form>

    <p v-if="error" role="alert" class="text-sm">{{ error }}</p>
    <p v-if="result" role="status" class="text-sm">{{ result }}</p>
    <BaseButton v-if="error && !facts" variant="secondary" size="sm" @click="load">Réessayer</BaseButton>
    <p v-else-if="!facts" role="status" class="text-sm">Lecture de votre mémoire…</p>
    <p v-else-if="!facts.length" class="text-sm text-muted-foreground">Aucun fait retenu pour le moment.</p>
    <ul v-else class="divide-y divide-border" aria-label="Faits retenus">
      <li v-for="fact in facts" :key="fact.id" class="space-y-2 py-3">
        <template v-if="editingId === fact.id">
          <label :for="`memory-edit-${fact.id}`" class="sr-only">Corriger le fait</label>
          <textarea
            :id="`memory-edit-${fact.id}`"
            v-model="editText"
            :maxlength="MAX_LENGTH"
            rows="2"
            class="w-full rounded-lg border border-input bg-background p-2 text-sm"
          />
          <div class="flex flex-wrap gap-2">
            <BaseButton size="sm" :loading="busy" :disabled="!editText.trim()" @click="saveEdit(fact.id)">Enregistrer</BaseButton>
            <BaseButton size="sm" variant="secondary" :disabled="busy" @click="editingId = null">Annuler</BaseButton>
          </div>
        </template>
        <template v-else>
          <p class="text-sm">{{ fact.text }}</p>
          <p class="text-xs text-muted-foreground">
            {{ fact.origin === "chat" ? "Approuvé dans le chat" : "Ajouté dans Réglages" }}
            · mis à jour {{ preferences.formatDate(fact.updatedAt) }}
            <span v-if="stale(fact)"> · ancien, vérifiez qu’il est toujours exact</span>
          </p>
          <div v-if="forgettingId === fact.id" class="flex flex-wrap items-center gap-2">
            <span class="text-sm">Oublier définitivement ce fait ?</span>
            <BaseButton size="sm" variant="danger" :loading="busy" @click="forget(fact.id)">Confirmer l’oubli</BaseButton>
            <BaseButton size="sm" variant="secondary" :disabled="busy" @click="forgettingId = null">Annuler</BaseButton>
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <BaseButton size="sm" variant="secondary" :disabled="busy" :aria-label="`Corriger : ${fact.text}`" @click="startEdit(fact)">Corriger</BaseButton>
            <BaseButton size="sm" variant="secondary" :disabled="busy" :aria-label="`Oublier : ${fact.text}`" @click="forgettingId = fact.id; editingId = null">Oublier</BaseButton>
          </div>
        </template>
      </li>
    </ul>
  </BaseCard>
</template>
