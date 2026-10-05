import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { AccountPreferences } from "@/core/contracts/v1";
import { useAppStore } from "./appStore";

export const usePreferencesStore = defineStore("preferences", () => {
  const app = useAppStore();
  const current = ref<AccountPreferences | null>(null);
  const busy = ref(false);
  const error = ref("");
  let generation = 0;
  watch(() => app.accountEpoch, () => {
    generation += 1;
    current.value = null;
    error.value = "";
    busy.value = false;
  }, { flush: "sync" });

  function apply(value: AccountPreferences) {
    current.value = value;
    app.theme = value.theme;
  }

  async function load() {
    current.value = null;
    error.value = "";
    const requestGeneration = generation;
    try {
      const value = await app.jarvis.preferences();
      if (requestGeneration !== generation) return;
      apply(value);
    } catch {
      if (requestGeneration !== generation) return;
      error.value = "Impossible de charger vos préférences. Réessayez.";
    }
  }

  async function save(value: AccountPreferences) {
    if (busy.value) return false;
    busy.value = true;
    const requestGeneration = generation;
    error.value = "";
    try {
      const saved = await app.jarvis.savePreferences(value);
      if (requestGeneration !== generation) return false;
      apply(saved);
      return true;
    } catch {
      if (requestGeneration !== generation) return false;
      error.value =
        "L’enregistrement ne peut pas être confirmé. Réessayez avant de continuer.";
      return false;
    } finally {
      if (requestGeneration === generation) busy.value = false;
    }
  }

  function formatDate(value: string, timeOnly = false) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date indisponible";
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: current.value?.displayTimezone || "Europe/Paris",
      ...(timeOnly
        ? { timeStyle: "short" as const }
        : {
            dateStyle: "medium" as const,
            timeStyle: "short" as const,
          }),
    }).format(date);
  }

  return { current, busy, error, load, save, formatDate };
});
