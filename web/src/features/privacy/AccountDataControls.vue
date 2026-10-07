<script setup lang="ts">
import { ref } from "vue";
import BaseCard from "@/shared/ui/BaseCard.vue";
import BaseButton from "@/shared/ui/BaseButton.vue";
import BaseInput from "@/shared/ui/BaseInput.vue";
import type { AccountProfile } from "@/core/api/account";
import { useAppStore } from "@/stores/appStore";
import { env } from "@/core/config/env";
import { HttpError } from "@/core/api/http";
import {
  downloadAccountSnapshot,
  ExportCapacityError,
} from "./account-snapshot";
import { prepareErasureReceipt, readErasureReceipt } from "./erasure-receipt";

const props = defineProps<{ account: AccountProfile }>();
const emit = defineEmits<{ accepted: [] }>();
const app = useAppStore();
const trackingHref = `${import.meta.env.BASE_URL || "/"}deletion-status`;
const exportBusy = ref(false);
const deletionBusy = ref(false);
const confirmation = ref("");
const understood = ref(false);
const notice = ref("");
const error = ref("");
const receipt = ref(readErasureReceipt());
const prepared = ref(false);

async function exportData() {
  exportBusy.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await downloadAccountSnapshot(
      env.apiBaseUrl,
      props.account.id,
    );
    notice.value =
      result === "saved"
        ? "Export complet enregistré."
        : "Export complet vérifié. Le téléchargement a été lancé.";
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === "AbortError")
      notice.value = "Téléchargement annulé.";
    else if (failure instanceof ExportCapacityError)
      error.value = failure.message;
    else
      error.value =
        "L’export complet n’a pas pu être confirmé. Aucun fichier partiel n’est proposé. Réessayez.";
  } finally {
    exportBusy.value = false;
  }
}

function prepareDeletion() {
  error.value = "";
  try {
    receipt.value = prepareErasureReceipt(props.account.id);
    prepared.value = true;
  } catch {
    error.value =
      "Le reçu ne peut pas être conservé dans cet onglet. Autorisez le stockage du navigateur avant de réessayer.";
  }
}

function downloadReceipt() {
  if (!receipt.value) return;
  const blob = new Blob(
    [
      `Reçu de suppression Jarvis\n${receipt.value}\n\nOuvrez /deletion-status sur votre installation Jarvis et collez ce reçu.\nLe suivi expire sept jours après la demande.\n`,
    ],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "jarvis-recu-suppression.txt";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function deleteAccount() {
  if (
    !prepared.value ||
    !receipt.value ||
    !understood.value ||
    confirmation.value.trim().toLowerCase() !==
      props.account.email.toLowerCase()
  )
    return;
  deletionBusy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await app.jarvis.requestDeletion({
      expectedAccountId: props.account.id,
      confirmEmail: confirmation.value.trim(),
      receipt: receipt.value,
    });
    app.invalidateAccount();
    emit("accepted");
  } catch (failure) {
    error.value =
      failure instanceof HttpError && failure.status === 409
        ? failure.message
        : "La demande n’a pas pu être confirmée. La suppression peut néanmoins être enregistrée et reprendre au redémarrage du service, même après une erreur. Conservez votre reçu et consultez son suivi avant de réessayer.";
  } finally {
    deletionBusy.value = false;
  }
}
</script>

<template>
  <BaseCard class="space-y-4 p-5" aria-labelledby="data-controls-title">
    <h2 id="data-controls-title" class="font-semibold">
      Export et suppression
    </h2>
    <p class="max-w-prose text-sm text-muted-foreground">
      Téléchargez une copie complète de vos données Jarvis avant de supprimer
      votre compte.
    </p>
    <BaseButton
      variant="secondary"
      :loading="exportBusy"
      :disabled="deletionBusy"
      @click="exportData"
      >Télécharger mes données</BaseButton
    >
    <p v-if="notice" role="status" class="text-sm">{{ notice }}</p>
    <p v-if="error" role="alert" class="text-sm">{{ error }}</p>
    <div class="space-y-3 border-t border-border pt-4">
      <h3 class="font-medium">Supprimer mon compte Jarvis</h3>
      <p class="max-w-prose text-sm text-muted-foreground">
        Cette action efface vos données Jarvis, retire son accès à Google et
        révoque votre invitation. Vos emails et rendez-vous dans Google restent
        conservés.
      </p>
      <BaseButton
        v-if="!prepared"
        variant="secondary"
        :disabled="exportBusy"
        @click="prepareDeletion"
        >Préparer la suppression</BaseButton
      >
      <template v-else>
        <p class="text-sm">
          Un reçu est conservé dans cet onglet. Téléchargez-le pour suivre votre
          demande après fermeture du navigateur. Même si une erreur est affichée après
          confirmation, la suppression peut être enregistrée et reprendre au
          redémarrage du service.
        </p>
        <BaseButton variant="secondary" @click="downloadReceipt"
          >Télécharger mon reçu</BaseButton
        >
        <BaseInput
          v-model="confirmation"
          label="Adresse email du compte à supprimer"
          :placeholder="account.email"
          autocomplete="email"
        />
        <label class="flex items-start gap-2 text-sm">
          <input v-model="understood" type="checkbox" class="mt-1" />
          <span
            >Je comprends que mes données Jarvis seront effacées et mon accès à
            la bêta retiré.</span
          >
        </label>
        <BaseButton
          class="privacy-delete-confirm"
          variant="danger"
          :loading="deletionBusy"
          :disabled="
            !understood ||
            confirmation.trim().toLowerCase() !== account.email.toLowerCase() ||
            exportBusy
          "
          @click="deleteAccount"
          >Confirmer la suppression de mon compte</BaseButton
        >
      </template>
      <a
        v-if="receipt"
        :href="trackingHref"
        class="block text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >Suivre une demande de suppression</a
      >
    </div>
  </BaseCard>
</template>

<style scoped>
.privacy-delete-confirm {
  height: auto;
  min-height: 44px;
  max-width: 100%;
  padding-block: 0.5rem;
  white-space: normal;
}
</style>
