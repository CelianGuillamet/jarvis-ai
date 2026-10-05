<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import BaseButton from "@/shared/ui/BaseButton.vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import { useAppStore } from "@/stores/appStore";
import { useStatusStore } from "@/stores/statusStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import {
  submitTodayRequest,
  beginNewTodayIntent,
} from "@/core/api/today-request-identity";
import { TodayMutationSchema } from "@/core/contracts/v1";
import type { TodayLocalSnapshot, TodayMutation } from "@/core/contracts/v1";
const app = useAppStore();
const status = useStatusStore();
const preferences = usePreferencesStore();
const data = ref<TodayLocalSnapshot | null>(null);
const ownerId = ref("");
const conversationId = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const result = ref("");
const taskOffset = ref(0);
const noteOffset = ref(0);
const taskId = ref<string | null>(null);
const taskText = ref("");
const noteId = ref<string | null>(null);
const noteTitle = ref("");
const noteText = ref("");
const now = ref(Date.now());
let generation = 0;
const timer = setInterval(() => {
  now.value = Date.now();
}, 10000);
onUnmounted(() => {
  generation++;
  clearInterval(timer);
});
const stale = computed(
  () => !!data.value && now.value - Date.parse(data.value.fetchedAt) > 60000,
);
const calendarStale = computed(
  () =>
    !status.snapshot?.freshness.calendar.expiresAt ||
    Date.parse(status.snapshot.freshness.calendar.expiresAt) <= now.value,
);
const calendarLabels = {
  disconnected: "Connectez Google dans les paramètres.",
  permission_required: "L’autorisation du calendrier est requise.",
  unavailable: "Le calendrier est indisponible. Réessayez.",
  invalid_response: "Le calendrier n’a pas pu être vérifié.",
  not_refreshed: "Actualisez pour consulter le calendrier.",
  available: "",
};
async function load() {
  if (loading.value) return;
  const token = generation;
  loading.value = true;
  error.value = "";
  try {
    const [account, next] = await Promise.all([
      app.jarvis.account(),
      app.jarvis.today(app.sessionId, taskOffset.value, noteOffset.value),
    ]);
    if (token !== generation) return;
    if (ownerId.value && ownerId.value !== account.id) {
      data.value = null;
      taskText.value = "";
      noteText.value = "";
      taskId.value = null;
      noteId.value = null;
    }
    ownerId.value = account.id;
    conversationId.value = next.conversationId;
    data.value = next;
  } catch (cause) {
    if (token === generation)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Les données sont indisponibles.";
  } finally {
    if (token === generation) loading.value = false;
  }
}
async function save(mutation: TodayMutation) {
  if (saving.value || loading.value || !ownerId.value) return false;
  const token = generation;
  const sessionId = conversationId.value;
  const owner = ownerId.value;
  saving.value = true;
  error.value = "";
  result.value = "";
  try {
    mutation = TodayMutationSchema.parse(mutation);
    const outcome = await submitTodayRequest(
      { ownerId: owner, sessionId },
      mutation,
      (requestId) => {
        if (token !== generation) throw new Error("La conversation a changé.");
        return app.jarvis.mutateToday({ sessionId, requestId, mutation });
      },
    );
    if (token !== generation) return false;
    result.value = outcome.simulation
      ? "Simulation : aucune modification enregistrée."
      : outcome.text;
    await Promise.all([load(), status.refresh()]);
    return outcome.state === "completed";
  } catch (cause) {
    if (token === generation)
      error.value =
        (cause instanceof Error ? cause.message : "Résultat non confirmé.") +
        " Reprenez les mêmes valeurs pour vérifier cette action.";
    return false;
  } finally {
    if (token === generation) saving.value = false;
  }
}
async function saveTask() {
  const mutation: TodayMutation = taskId.value
    ? { operation: "task.edit", id: taskId.value, text: taskText.value }
    : { operation: "task.create", text: taskText.value };
  if (await save(mutation)) {
    taskId.value = null;
    taskText.value = "";
  }
}
async function saveNote() {
  const mutation: TodayMutation = noteId.value
    ? {
        operation: "note.edit",
        id: noteId.value,
        title: noteTitle.value || null,
        text: noteText.value,
      }
    : {
        operation: "note.create",
        title: noteTitle.value || null,
        text: noteText.value,
      };
  if (await save(mutation)) {
    noteId.value = null;
    noteTitle.value = "";
    noteText.value = "";
  }
}
async function newIntent(kind: "task" | "note") {
  if (saving.value || loading.value || !ownerId.value) return;
  const token = generation;
  try {
    await beginNewTodayIntent(
      { ownerId: ownerId.value, sessionId: conversationId.value },
      kind === "task"
        ? { operation: "task.create", text: "" }
        : { operation: "note.create", title: null, text: "" },
    );
    if (token !== generation) return;
    if (kind === "task") {
      taskId.value = null;
      taskText.value = "";
    } else {
      noteId.value = null;
      noteTitle.value = "";
      noteText.value = "";
    }
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Action précédente à vérifier.";
  }
}
async function page(kind: "task" | "note", delta: number) {
  if (loading.value || saving.value) return;
  const token = generation;
  const previousTaskOffset = taskOffset.value;
  const previousNoteOffset = noteOffset.value;
  if (kind === "task") taskOffset.value = Math.max(0, taskOffset.value + delta);
  else noteOffset.value = Math.max(0, noteOffset.value + delta);
  await load();
  if (token === generation && error.value) {
    taskOffset.value = previousTaskOffset;
    noteOffset.value = previousNoteOffset;
  }
}
watch(
  () => app.sessionId,
  () => {
    generation++;
    data.value = null;
    ownerId.value = "";
    conversationId.value = "";
    taskOffset.value = 0;
    noteOffset.value = 0;
    taskId.value = null;
    noteId.value = null;
    taskText.value = "";
    noteText.value = "";
    noteTitle.value = "";
    loading.value = false;
    saving.value = false;
    error.value = "";
    result.value = "";
    void load();
  },
);
onMounted(() => {
  void load();
  void status.refresh();
});
</script>

<template>
  <section class="space-y-6" aria-labelledby="today-title">
    <header
      class="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"
    >
      <div>
        <h1 id="today-title" class="text-3xl font-semibold tracking-tight">
          Aujourd’hui
        </h1>
        <p class="mt-2 text-muted-foreground">
          Vos rendez-vous, vos tâches et vos idées, au même endroit.
        </p>
      </div>
      <BaseButton
        variant="secondary"
        :disabled="loading || saving || status.busy"
        @click="
          load();
          status.refresh(true);
        "
        >Actualiser</BaseButton
      >
    </header>
    <p
      v-if="error"
      role="alert"
      class="rounded-xl border border-red-500/40 p-4"
    >
      {{ error }}
      <button type="button" class="underline" :disabled="loading" @click="load">
        Réessayer la lecture
      </button>
    </p>
    <p v-if="result" role="status" class="rounded-xl border border-border p-4">
      {{ result }}
    </p>
    <p v-if="loading && !data" role="status">Chargement de votre journée…</p>
    <p v-if="data" class="text-sm text-muted-foreground">
      Données lues {{ preferences.formatDate(data.fetchedAt)
      }}<span v-if="stale || error"> · Données à actualiser</span>
    </p>
    <div class="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <aside class="space-y-5">
        <BaseCard class="p-5" aria-labelledby="situation-title">
          <h2 id="situation-title" class="text-lg font-semibold">Radar de situation</h2>
          <p class="mt-2 text-sm text-muted-foreground">
            Vue issue de la dernière lecture. Ces indications ne déclenchent aucune action.
          </p>
          <p v-if="!status.snapshot" class="mt-3">Situation non vérifiée. Actualisez pour consulter vos priorités.</p>
          <template v-else>
            <div v-if="status.snapshot.focus.activeMission" class="mt-4 space-y-2 break-words">
              <h3 class="font-medium">Mission en cours</h3>
              <p>{{ status.snapshot.focus.activeMission.objective }}</p>
              <p class="text-sm text-muted-foreground">{{ status.snapshot.focus.activeMission.summary }}</p>
              <p v-if="status.snapshot.focus.activeMission.nextStep" class="text-sm">
                Prochaine étape : {{ status.snapshot.focus.activeMission.nextStep }}
              </p>
            </div>
            <ul v-if="status.snapshot.proactiveSuggestions?.length" class="mt-4 space-y-4">
              <li v-for="(suggestion, index) in status.snapshot.proactiveSuggestions" :key="index" class="break-words">
                <h3 class="font-medium">{{ suggestion.title }}</h3>
                <p class="mt-1 text-sm text-muted-foreground">{{ suggestion.detail }}</p>
              </li>
            </ul>
            <p v-else class="mt-3 text-sm text-muted-foreground">Aucune suggestion dans la dernière lecture.</p>
            <RouterLink to="/chat" class="mt-4 inline-block underline">Faire le point avec Jarvis</RouterLink>
          </template>
        </BaseCard>
        <BaseCard class="p-5"
          ><h2 class="text-lg font-semibold">Calendrier</h2>
          <p v-if="!status.snapshot" class="mt-3">
            Le calendrier n’a pas encore pu être vérifié.
          </p>
          <template v-else>
            <p
              v-if="status.snapshot.availability.calendar !== 'available'"
              class="mt-3"
            >
              {{ calendarLabels[status.snapshot.availability.calendar] }}
            </p>
            <p v-if="calendarStale" class="mt-3 text-sm text-muted-foreground">
              Données à actualiser avant de vous y fier.
            </p>
            <div
              v-if="status.snapshot.focus.nextEvent"
              class="mt-4 border-l-2 border-border pl-4"
            >
              <p class="font-medium">
                {{ status.snapshot.focus.nextEvent.title }}
              </p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{
                  preferences.formatDate(status.snapshot.focus.nextEvent.when)
                }}
              </p>
            </div>
            <p
              v-else-if="
                status.snapshot.availability.calendar === 'available' &&
                !calendarStale
              "
              class="mt-3"
            >
              Aucun rendez-vous à venir dans les données consultées.
            </p>
          </template>
        </BaseCard>
        <BaseCard class="p-5"
          ><h2 class="text-lg font-semibold">À confirmer</h2>
          <template v-if="status.snapshot?.pendingAction"
            ><p class="mt-3">{{ status.snapshot.pendingAction.summary }}</p>
            <RouterLink to="/chat" class="mt-3 inline-block underline"
              >Examiner dans l’assistant</RouterLink
            ></template
          >
          <p v-else-if="status.snapshot" class="mt-3 text-muted-foreground">
            Aucune confirmation en attente lors de la dernière lecture.
          </p>
          <p v-else class="mt-3">État non vérifié.</p></BaseCard
        >
      </aside>
      <div class="space-y-5">
        <BaseCard class="p-5"
          ><h2 class="text-lg font-semibold">Tâches</h2>
          <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="saveTask">
            <label for="task-text" class="sr-only">Texte de la tâche</label
            ><input
              id="task-text"
              v-model="taskText"
              required
              maxlength="10000"
              class="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2"
              :disabled="saving"
              placeholder="Que souhaitez-vous faire ?"
            /><BaseButton
              type="submit"
              :disabled="saving || loading || !ownerId"
              >{{ taskId ? "Enregistrer" : "Ajouter" }}</BaseButton
            ><BaseButton
              type="button"
              variant="ghost"
              :disabled="saving || loading || !ownerId"
              @click="newIntent('task')"
              >Nouvelle tâche</BaseButton
            >
          </form>
          <ul v-if="data" class="mt-5 divide-y divide-border">
            <li
              v-for="task in data.tasks"
              :key="task.id"
              class="flex items-center gap-3 py-3"
            >
              <button
                type="button"
                :disabled="saving || loading"
                :aria-label="`${task.done ? 'Rouvrir' : 'Terminer'} : ${task.text}`"
                :aria-pressed="task.done"
                class="rounded border border-border px-2 py-1"
                @click="
                  save({
                    operation: task.done ? 'task.reopen' : 'task.complete',
                    id: task.id,
                  })
                "
              >
                {{ task.done ? "✓" : "○" }}</button
              ><span
                class="min-w-0 flex-1 break-words"
                :class="{ 'line-through text-muted-foreground': task.done }"
                >{{ task.text }}</span
              ><button
                type="button"
                class="text-sm underline"
                :disabled="saving"
                @click="
                  taskId = task.id;
                  taskText = task.text;
                "
              >
                Modifier<span class="sr-only"> {{ task.text }}</span>
              </button>
            </li>
          </ul>
          <p
            v-if="data && !data.tasks.length"
            class="mt-4 text-muted-foreground"
          >
            Aucune tâche sur cette page. Ajoutez votre première tâche.
          </p>
          <nav
            v-if="data"
            aria-label="Pages des tâches"
            class="mt-4 flex justify-between"
          >
            <BaseButton
              variant="ghost"
              :disabled="!taskOffset || loading || saving"
              @click="page('task', -50)"
              >Précédentes</BaseButton
            ><BaseButton
              variant="ghost"
              :disabled="
                !data.tasksHasMore || taskOffset >= 10000 || loading || saving
              "
              @click="page('task', 50)"
              >Suivantes</BaseButton
            >
          </nav>
        </BaseCard>
        <BaseCard class="p-5"
          ><h2 class="text-lg font-semibold">Notes</h2>
          <form class="mt-4 space-y-3" @submit.prevent="saveNote">
            <label for="note-title" class="block text-sm"
              >Titre facultatif</label
            ><input
              id="note-title"
              v-model="noteTitle"
              maxlength="200"
              class="w-full rounded-lg border border-border bg-background px-3 py-2"
              :disabled="saving"
            /><label for="note-text" class="block text-sm">Votre note</label
            ><textarea
              id="note-text"
              v-model="noteText"
              required
              maxlength="10000"
              rows="3"
              class="w-full rounded-lg border border-border bg-background px-3 py-2"
              :disabled="saving"
            />
            <div class="flex gap-2">
              <BaseButton
                type="submit"
                :disabled="saving || loading || !ownerId"
                >{{ noteId ? "Enregistrer" : "Ajouter la note" }}</BaseButton
              ><BaseButton
                type="button"
                variant="ghost"
                :disabled="saving || loading || !ownerId"
                @click="newIntent('note')"
                >Nouvelle note</BaseButton
              >
            </div>
          </form>
          <ul v-if="data" class="mt-5 divide-y divide-border">
            <li v-for="note in data.notes" :key="note.id" class="py-4">
              <h3 class="font-medium">{{ note.title || "Sans titre" }}</h3>
              <p
                class="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground"
              >
                {{ note.text }}
              </p>
              <button
                type="button"
                class="mt-3 text-sm underline"
                :disabled="saving"
                @click="
                  noteId = note.id;
                  noteTitle = note.title || '';
                  noteText = note.text;
                "
              >
                Modifier<span class="sr-only">
                  {{ note.title || "la note" }}</span
                >
              </button>
            </li>
          </ul>
          <p
            v-if="data && !data.notes.length"
            class="mt-4 text-muted-foreground"
          >
            Aucune note sur cette page.
          </p>
          <nav
            v-if="data"
            aria-label="Pages des notes"
            class="mt-4 flex justify-between"
          >
            <BaseButton
              variant="ghost"
              :disabled="!noteOffset || loading || saving"
              @click="page('note', -50)"
              >Précédentes</BaseButton
            ><BaseButton
              variant="ghost"
              :disabled="
                !data.notesHasMore || noteOffset >= 10000 || loading || saving
              "
              @click="page('note', 50)"
              >Suivantes</BaseButton
            >
          </nav>
        </BaseCard>
      </div>
    </div>
  </section>
</template>
