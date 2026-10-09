<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import { useAppStore } from "@/stores/appStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { RoutineList, RoutineRun } from "@/core/contracts/v1";

const app = useAppStore();
const preferences = usePreferencesStore();
const data = ref<RoutineList | null>(null);
const error = ref("");
const busy = ref(false);
const resuming = ref<{ runId: string; stepId: string } | null>(null);
const resolution = ref<"retry" | "skip">("retry");
const evidence = ref("");
let alive = true;

const runStates: Record<RoutineRun["state"], string> = {
  running: "En cours",
  completed: "Terminée",
  failed: "Échouée",
  suspended: "En pause : résultat incertain",
  cancelled: "Annulée",
};
const stepStates: Record<RoutineRun["steps"][number]["state"], string> = {
  pending: "À venir",
  executing: "En cours",
  completed: "Terminée",
  failed: "Échouée",
  skipped: "Ignorée",
  unknown: "Résultat incertain",
  blocked: "En attente",
  cancelled: "Annulée",
};
const titles = computed(() => new Map((data.value?.routines ?? []).map(routine => [routine.key, routine.title])));

async function load() {
  error.value = "";
  try {
    const next = await app.jarvis.routines();
    if (alive) data.value = next;
  } catch {
    if (alive) error.value = "Impossible de lire les routines. Réessayez.";
  }
}

async function act(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch {
    error.value = "Le résultat n’a pas pu être confirmé. Actualisez avant de relancer.";
  } finally {
    busy.value = false;
    if (alive) await load();
  }
}

const run = (key: string) => act(() => app.jarvis.startRoutine(key, crypto.randomUUID(), app.sessionId));
const toggle = (key: string, enabled: boolean) => act(() => app.jarvis.setRoutineEnabled(key, enabled));
const cancel = (id: string) => act(() => app.jarvis.cancelRoutine(id));
const proceed = (id: string) => act(() => app.jarvis.continueRoutine(id));

function startResume(runId: string, stepId: string) {
  resuming.value = { runId, stepId };
  resolution.value = "retry";
  evidence.value = "";
}

function confirmResume() {
  const target = resuming.value;
  const note = evidence.value.trim();
  if (!target || note.length < 3) return;
  void act(async () => {
    await app.jarvis.resumeRoutine(target.runId, { stepId: target.stepId, resolution: resolution.value, evidence: note });
    resuming.value = null;
  });
}

onMounted(load);
onUnmounted(() => {
  alive = false;
});
</script>

<template>
  <BaseCard class="space-y-4 p-5" aria-labelledby="routines-title">
    <div>
      <h2 id="routines-title" class="font-semibold">Routines</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Une routine enchaîne des étapes en lecture seule, visibles ici. Elle n’envoie aucun e-mail et ne modifie
        aucun rendez-vous : toute action reste soumise à votre confirmation dans le chat.
      </p>
    </div>
    <p v-if="error" role="alert" class="text-sm">{{ error }}</p>
    <BaseButton v-if="error && !data" variant="secondary" size="sm" @click="load">Réessayer</BaseButton>
    <p v-else-if="!data" role="status" class="text-sm">Lecture des routines…</p>

    <template v-else>
      <ul class="divide-y divide-border" aria-label="Routines disponibles">
        <li v-for="routine in data.routines" :key="routine.key" class="space-y-2 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-medium">{{ routine.title }}</h3>
            <span class="text-xs text-muted-foreground">{{ routine.enabled ? "Activée" : "Désactivée" }}</span>
          </div>
          <p class="text-sm text-muted-foreground">{{ routine.description }}</p>
          <p class="text-xs text-muted-foreground">
            Étapes : {{ routine.steps.map(step => step.tool + (step.optional ? " (facultative)" : "")).join(" → ") }}
          </p>
          <div class="flex flex-wrap gap-2">
            <BaseButton size="sm" :loading="busy" :disabled="!routine.enabled" @click="run(routine.key)">Lancer</BaseButton>
            <BaseButton size="sm" variant="secondary" :disabled="busy" @click="toggle(routine.key, !routine.enabled)">
              {{ routine.enabled ? "Désactiver" : "Activer" }}
            </BaseButton>
          </div>
        </li>
      </ul>

      <p v-if="!data.runs.length" class="text-sm text-muted-foreground">Aucune exécution pour le moment.</p>
      <ol v-else class="space-y-3" aria-label="Exécutions récentes">
        <li v-for="item in data.runs" :key="item.id" class="space-y-2 rounded-lg border border-border p-3">
          <div class="flex flex-wrap justify-between gap-2">
            <h3 class="font-medium">{{ titles.get(item.routineKey) ?? item.routineKey }}</h3>
            <strong>{{ runStates[item.state] }}</strong>
          </div>
          <p class="text-xs text-muted-foreground">{{ preferences.formatDate(item.createdAt) }}</p>
          <ol class="space-y-1 text-sm" :aria-label="`Étapes de l’exécution du ${preferences.formatDate(item.createdAt)}`">
            <li v-for="step in item.steps" :key="step.id">
              {{ step.id }} · {{ stepStates[step.state] }}<span v-if="step.attempt > 1"> (tentative {{ step.attempt }})</span>
              <template v-if="step.state === 'unknown' && item.state === 'suspended'">
                <p>Le résultat de cette étape ne peut pas être confirmé. Rien n’est relancé automatiquement.</p>
                <BaseButton size="sm" variant="secondary" :disabled="busy" @click="startResume(item.id, step.id)">Décider de la suite</BaseButton>
              </template>
              <p v-if="step.evidence" class="text-xs text-muted-foreground">Justification : {{ step.evidence }}</p>
            </li>
          </ol>
          <div v-if="resuming && resuming.runId === item.id" class="space-y-2">
            <fieldset class="space-y-1">
              <legend class="text-sm font-medium">Que faire de l’étape {{ resuming.stepId }} ?</legend>
              <label class="flex items-center gap-2 text-sm"><input v-model="resolution" type="radio" value="retry" /> Relancer cette lecture</label>
              <label class="flex items-center gap-2 text-sm"><input v-model="resolution" type="radio" value="skip" /> Ignorer cette étape</label>
            </fieldset>
            <label :for="`routine-evidence-${item.id}`" class="text-sm font-medium">Justification (obligatoire)</label>
            <input
              :id="`routine-evidence-${item.id}`"
              v-model="evidence"
              maxlength="300"
              class="w-full rounded-lg border border-input bg-background p-2 text-sm"
            />
            <div class="flex flex-wrap gap-2">
              <BaseButton size="sm" :loading="busy" :disabled="evidence.trim().length < 3" @click="confirmResume">Confirmer</BaseButton>
              <BaseButton size="sm" variant="secondary" :disabled="busy" @click="resuming = null">Annuler</BaseButton>
            </div>
          </div>
          <pre v-if="item.result" class="whitespace-pre-wrap text-sm">{{ item.result }}</pre>
          <p v-if="item.cancelRequested && item.state === 'running'" role="status" class="text-sm">Annulation demandée : l’étape en cours se termine d’abord.</p>
          <div v-if="item.state === 'running' || item.state === 'suspended'" class="flex flex-wrap gap-2">
            <BaseButton v-if="item.state === 'running'" size="sm" variant="secondary" :disabled="busy" @click="proceed(item.id)">Reprendre</BaseButton>
            <BaseButton size="sm" variant="secondary" :disabled="busy" @click="cancel(item.id)">Annuler la routine</BaseButton>
          </div>
        </li>
      </ol>
    </template>
  </BaseCard>
</template>
