import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

import { env } from "@/core/config/env";
import { createJarvisApi } from "@/core/api/jarvis";
import {
  readStorageString,
  writeStorageString,
} from "@/shared/utils/storage";

const STORAGE_KEYS = {
  theme: "jarvis.web.theme",
} as const;

export type ThemeMode = "dark" | "light";

export const useAppStore = defineStore("app", () => {
  // Installation configuration never comes from editable browser storage.
  const sessionId = ref(env.defaultSessionId);
  const accountEpoch = ref(0);
  const invalidateAccount = () => { accountEpoch.value += 1; };
  const apiBaseUrl = ref(env.apiBaseUrl);
  const timeoutMs = ref(env.requestTimeoutMs);
  const theme = ref<ThemeMode>(
    readStorageString(STORAGE_KEYS.theme, "dark") === "light"
      ? "light"
      : "dark",
  );

  watch(theme, (value) => writeStorageString(STORAGE_KEYS.theme, value));

  watch(
    theme,
    (next) => {
      const root = document.documentElement;
      if (next === "light") root.classList.add("light");
      else root.classList.remove("light");
    },
    { immediate: true },
  );

  const jarvis = computed(() =>
    createJarvisApi({
      ...(apiBaseUrl.value.trim() ? { baseUrl: apiBaseUrl.value.trim() } : {}),
      timeoutMs: timeoutMs.value,
    }),
  );

  return {
    accountEpoch,
    invalidateAccount,
    sessionId,
    apiBaseUrl,
    timeoutMs,
    theme,
    jarvis,
  };
});
