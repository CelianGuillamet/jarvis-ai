<script setup lang="ts">
import { onMounted, ref } from "vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import { useAppStore } from "@/stores/appStore";
import type { PrivacyDisclosure } from "@/core/contracts/v1";

const app = useAppStore();
const disclosure = ref<PrivacyDisclosure | null>(null);
const error = ref("");
async function load() {
  error.value = "";
  try { disclosure.value = await app.jarvis.privacy(); }
  catch { error.value = "Impossible de vérifier les transferts de données. Réessayez."; }
}
onMounted(load);
</script>

<template>
  <BaseCard class="space-y-3 p-5" aria-labelledby="privacy-title">
    <h2 id="privacy-title" class="font-semibold">Vos données et leur utilisation</h2>
    <p v-if="error" role="alert">{{ error }}</p>
    <BaseButton v-if="error" variant="secondary" @click="load">Réessayer</BaseButton>
    <p v-else-if="!disclosure" role="status">Vérification des services configurés…</p>
    <template v-else>
      <dl class="space-y-3 text-sm">
        <div>
          <dt class="font-medium">Réponses de l’assistant</dt>
          <dd class="mt-1 text-muted-foreground">
            Vos demandes et leur contexte sont envoyés à
            {{ disclosure.model.endpointHost }} avec
            {{ disclosure.model.provider === "ollama" ? "Ollama" : "l’API compatible OpenAI" }}.
            {{ disclosure.model.transport === "loopback" ? "Ce serveur est local à l’installation de Jarvis." : "Ce serveur est accessible par le réseau." }}
            Un serveur configuré peut transmettre des données à d’autres services.
          </dd>
        </div>
        <div>
          <dt class="font-medium">Google</dt>
          <dd class="mt-1 text-muted-foreground">
            {{ disclosure.google.signInConfigured ? "Google vérifie votre connexion à Jarvis." : "La connexion Google n’est pas configurée." }}
            {{ disclosure.google.toolsConfigured ? "Jarvis demande l’accès à Gmail et Google Agenda, y compris pour modifier et envoyer. Les actions restent limitées aux autorisations que vous accordez. Les contenus nécessaires à vos demandes peuvent être inclus dans le contexte de l’assistant." : "L’accès à Gmail et Google Agenda n’est pas configuré." }}
          </dd>
        </div>
        <div>
          <dt class="font-medium">Météo et recherche web</dt>
          <dd class="mt-1 text-muted-foreground">
            Une demande météo transmet la ville ou les coordonnées demandées à
            {{ disclosure.weatherHosts.join(" et ") }}. La recherche web est désactivée.
          </dd>
        </div>
      </dl>
      <details class="rounded-lg border border-border p-3 text-sm">
        <summary class="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Durées de conservation</summary>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Vos tâches, notes et souvenirs restent jusqu’à leur suppression.</li>
          <li>Les échanges terminés restent {{ disclosure.retention.conversationDays }} jours.</li>
          <li>Les diagnostics techniques JarvisLog enregistrés en base restent {{ disclosure.retention.diagnosticDays }} jours, sans texte brut des échanges. Les journaux d’hébergement sont gérés séparément par l’opérateur.</li>
          <li>Les journaux de commandes et d’actions (Command et JarvisActionEvent) restent jusqu’à la suppression du compte pour permettre la reprise et le suivi des opérations. Ils peuvent conserver les arguments, réponses, aperçus de résultats et messages d’erreur ; la minimisation des diagnostics JarvisLog ne s’applique pas à ces contenus.</li>
          <li>Le reçu de suppression permet le suivi pendant {{ disclosure.retention.receiptDays }} jours.</li>
          <li>Les sauvegardes éventuelles sont gérées par l’opérateur et doivent expirer sous {{ disclosure.retention.maximumBackupDays }} jours. Une suppression doit être réappliquée avant de remettre une sauvegarde en service.</li>
        </ul>
      </details>
      <p v-if="!disclosure.processingEnabled" role="status" class="text-sm">
        Le traitement automatique de suppression et de rétention est en pause. Les demandes attendent sa reprise.
      </p>
    </template>
  </BaseCard>
</template>
