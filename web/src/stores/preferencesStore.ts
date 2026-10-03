import { defineStore } from "pinia";
import { ref } from "vue";
import type { AccountPreferences } from "@/core/contracts/v1";
import { useAppStore } from "./appStore";

export const usePreferencesStore = defineStore("preferences", () => {
  const app = useAppStore();
  const current = ref<AccountPreferences | null>(null);
  const busy = ref(false);
  const error = ref("");

  function apply(value: AccountPreferences) {
    current.value = value;
    app.theme = value.theme;
  }

  async function load() {
    current.value = null;
    error.value = "";
    try {
      apply(await app.jarvis.preferences());
    } catch {
      error.value = "Impossible de charger vos préférences. Réessayez.";
    }
  }

  async function save(value: AccountPreferences) {
    if (busy.value) return false;
    busy.value = true;
    error.value = "";
    try {
      apply(await app.jarvis.savePreferences(value));
      return true;
    } catch {
      error.value =
        "L’enregistrement ne peut pas être confirmé. Réessayez avant de continuer.";
      return false;
    } finally {
      busy.value = false;
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
