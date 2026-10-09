<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BaseButton from '@/shared/ui/BaseButton.vue';
import BaseCard from '@/shared/ui/BaseCard.vue';
import RoutinesCard from '@/features/routines/RoutinesCard.vue';
import { useAppStore } from '@/stores/appStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { ActivityResponse } from '@/core/contracts/v1';
const app = useAppStore();
const preferences = usePreferencesStore();
const commands = ref<ActivityResponse['commands']>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
let generation = 0;
let controller: AbortController | null = null;
const labels = {
  proposed: 'Proposée', waiting: 'À confirmer', executing: 'En cours', completed: 'Terminée',
  failed: 'Échouée', cancelled: 'Annulée', expired: 'Expirée', unknown: 'Résultat incertain',
};
const operationLabel = (operation: string) => {
  const domain = operation.split('.')[0];
  return ({ todo: 'Tâches', note: 'Notes', shopping: 'Courses', gmail: 'E-mails', calendar: 'Calendrier', reminder: 'Rappels', inbox: 'Boîte de réception' } as Record<string, string>)[domain ?? ''] ?? 'Action';
};
async function load(older = false) {
  if (loading.value || (older && !cursor.value)) return;
  const token = generation;
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    const page = await app.jarvis.activity({ sessionId: app.sessionId, limit: 20, ...(older && cursor.value ? { cursor: cursor.value } : {}) }, controller.signal);
    if (token !== generation) return;
    commands.value = older ? [...commands.value, ...page.commands.filter(command => !commands.value.some(existing => existing.id === command.id))] : page.commands;
    cursor.value = page.nextCursor;
    loaded.value = true;
  } catch (cause) {
    if (token !== generation) return;
    error.value = cause instanceof Error ? cause.message : 'Activité indisponible.';
  } finally { if (token === generation) loading.value = false; }
}
function reset() {
  generation++;
  controller?.abort();
  commands.value = [];
  cursor.value = null;
  loaded.value = false;
  loading.value = false;
  error.value = '';
}
watch(() => [app.accountEpoch, app.sessionId], reset, { flush: 'sync' });
onUnmounted(reset);
onMounted(() => load());
</script>

<template>
  <section class="space-y-4" aria-labelledby="activity-title">
    <header class="flex items-center justify-between gap-4">
      <div><h1 id="activity-title" class="text-2xl font-semibold">Activité</h1><p class="text-sm text-muted-foreground">Les résultats enregistrés de vos actions.</p></div>
      <BaseButton variant="secondary" :loading="loading" @click="load()">Actualiser</BaseButton>
    </header>
    <RoutinesCard :key="`${app.accountEpoch}:${app.sessionId}`" />
    <BaseCard v-if="error" role="alert"><h2>Activité indisponible</h2><p>{{ error }}</p><p>Actualisez la lecture pour vérifier les résultats. Ne relancez pas une action pour cette seule raison.</p></BaseCard>
    <p v-if="loading" role="status">Chargement de l’activité…</p>
    <BaseCard v-else-if="loaded && !commands.length && !error"><h2>Aucune action enregistrée</h2><p>Vos prochaines actions apparaîtront ici.</p></BaseCard>
    <ol v-if="commands.length" class="space-y-3" aria-label="Actions enregistrées">
      <li v-for="command in commands" :key="command.id">
        <BaseCard><div class="flex flex-wrap justify-between gap-2"><h2 class="font-semibold">{{ operationLabel(command.operation) }}</h2><strong>{{ command.outcomeCode === 'SIMULATED' ? 'Simulation · ' + labels[command.state] : labels[command.state] }}</strong></div>
          <p class="text-sm text-muted-foreground">{{ preferences.formatDate(command.createdAt) }}</p>
          <p v-if="command.state === 'unknown'">Le résultat ne peut pas être confirmé. Vérifiez le service concerné avant toute nouvelle action.</p>
          <p v-else-if="command.state === 'executing'">L’action a commencé. Actualisez la lecture pour vérifier son résultat.</p>
          <p v-else-if="command.state === 'failed'">L’action a échoué. Consultez son contexte avant de décider de la suite.</p>
          <p v-else-if="command.state === 'waiting' && Date.parse(command.expiresAt) <= Date.now()">Cette confirmation a expiré. Relisez la conversation avant de formuler une nouvelle demande.</p>
          <p v-else-if="command.state === 'waiting'">Relisez la demande et ses cibles dans la conversation avant de confirmer ou d’annuler.</p>
          <p v-if="command.undoRecorded">Un retour arrière local a été enregistré. Demandez « annule la dernière action » dans le chat ; Jarvis vérifiera les éléments et demandera confirmation.</p>
          <RouterLink :to="command.source === 'inbox' ? '/inbox-zero' : '/chat'" class="underline">{{ command.source === 'inbox' ? 'Consulter la boîte de réception' : 'Consulter la conversation' }}</RouterLink>
        </BaseCard>
      </li>
    </ol>
    <BaseButton v-if="cursor" :loading="loading" variant="secondary" @click="load(true)">Voir les actions précédentes</BaseButton>
  </section>
</template>
