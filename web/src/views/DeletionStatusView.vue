<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import BaseInput from "@/shared/ui/BaseInput.vue";
import { createJarvisApi } from "@/core/api/jarvis";
import { HttpError } from "@/core/api/http";
import { env } from "@/core/config/env";
import { AccountErasureReceiptSchema } from "@/core/contracts/v1";
import type { AccountErasureStatus } from "@/core/contracts/v1";
import { readErasureReceipt } from "@/features/privacy/erasure-receipt";

const homeHref = import.meta.env.BASE_URL || "/";
const api = createJarvisApi({
  baseUrl: env.apiBaseUrl,
  timeoutMs: env.requestTimeoutMs,
});
const receipt = ref(readErasureReceipt() ?? "");
const job = ref<AccountErasureStatus | null>(null);
const busy = ref(false);
const error = ref("");
let controller: AbortController | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let alive = true;
const valid = computed(
  () => AccountErasureReceiptSchema.safeParse(receipt.value.trim()).success,
);
const label = computed(() => {
  if (!job.value) return "";
  if (job.value.state === "completed")
    return "Vos données Jarvis ont été supprimées.";
  if (job.value.state === "local_deleted")
    return "Vos données locales sont supprimées. La révocation Google est en cours.";
  if (job.value.state === "blocked")
    return "La suppression nécessite une intervention avant de continuer.";
  return "Votre demande de suppression est enregistrée et en cours de traitement.";
});
watch(receipt, () => {
  controller?.abort();
  job.value = null;
  error.value = "";
});
async function refresh() {
  if (!valid.value || busy.value) return;
  const current = receipt.value.trim();
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  try {
    const result = await api.deletionStatus(current, controller.signal);
    if (alive && current === receipt.value.trim()) job.value = result;
  } catch (failure) {
    if (
      !alive ||
      current !== receipt.value.trim() ||
      (failure instanceof DOMException && failure.name === "AbortError")
    )
      return;
    error.value =
      failure instanceof HttpError && failure.status === 404
        ? "Ce reçu est inconnu ou a expiré. Le suivi est disponible pendant sept jours."
        : "Le suivi est temporairement indisponible. Réessayez plus tard.";
  } finally {
    busy.value = false;
    controller = undefined;
  }
}
onMounted(() => {
  void refresh();
  timer = setInterval(() => {
    if (job.value && job.value.state !== "completed") void refresh();
  }, 15000);
});
onUnmounted(() => {
  alive = false;
  controller?.abort();
  if (timer) clearInterval(timer);
});
</script>

<template>
  <main
    class="mx-auto max-w-2xl space-y-4 p-6"
    aria-labelledby="deletion-status-title"
  >
    <BaseCard class="space-y-4 p-5">
      <h1 id="deletion-status-title" class="text-lg font-semibold">
        Suivi de votre suppression
      </h1>
      <p class="text-sm text-muted-foreground">
        Votre reçu permet de suivre la demande sans vous reconnecter. Il ne
        donne pas accès à vos anciennes données.
      </p>
      <BaseInput
        v-model="receipt"
        label="Reçu de suppression"
        autocomplete="off"
        :spellcheck="false"
      />
      <BaseButton :loading="busy" :disabled="!valid" @click="refresh"
        >Vérifier ma demande</BaseButton
      >
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="job">
        <p role="status">{{ label }}</p>
        <p
          v-if="job.revocationStatus === 'manual_required'"
          role="status"
          class="text-sm"
        >
          La révocation Google n’a pas été confirmée. Retirez manuellement les
          autorisations de Jarvis dans votre compte Google.
        </p>
        <a
          v-if="job.revocationStatus !== 'complete'"
          href="https://myaccount.google.com/connections"
          target="_blank"
          rel="noopener noreferrer"
          class="block text-sm underline"
          >Gérer les autorisations Google</a
        >
        <p class="text-sm text-muted-foreground">
          Suivi disponible jusqu’au
          {{ new Date(job.receiptExpiresAt).toLocaleString("fr-FR") }}.
        </p>
      </template>
      <a :href="homeHref" class="block text-sm underline">Revenir à Jarvis</a>
    </BaseCard>
  </main>
</template>
