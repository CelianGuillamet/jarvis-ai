import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

import { env } from "@/core/config/env";
import { createJarvisApi } from "@/core/api/jarvis";
import {
  readStorageNumber,
  readStorageString,
  writeStorageNumber,
  writeStorageString,
} from "@/shared/utils/storage";

const STORAGE_KEYS = {
  sessionId: "jarvis.web.sessionId",
  apiBaseUrl: "jarvis.web.apiBaseUrl",
  theme: "jarvis.web.theme",
  timeoutMs: "jarvis.web.timeoutMs",
} as const;

export type ThemeMode = "dark" | "light";

export const useAppStore = defineStore("app", () => {
  const sessionId = ref(
    readStorageString(STORAGE_KEYS.sessionId, env.defaultSessionId),
  );
  const apiBaseUrl = ref(
    readStorageString(STORAGE_KEYS.apiBaseUrl, env.apiBaseUrl),
  );
  const timeoutMs = ref(
    readStorageNumber(STORAGE_KEYS.timeoutMs, env.requestTimeoutMs),
  );
  const theme = ref<ThemeMode>(
    readStorageString(STORAGE_KEYS.theme, "dark") === "light"
      ? "light"
      : "dark",
  );

  watch(sessionId, (value) =>
    writeStorageString(STORAGE_KEYS.sessionId, value.trim()),
  );
  watch(apiBaseUrl, (value) =>
    writeStorageString(STORAGE_KEYS.apiBaseUrl, value.trim()),
  );
  watch(timeoutMs, (value) =>
    writeStorageNumber(STORAGE_KEYS.timeoutMs, value),
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
    sessionId,
    apiBaseUrl,
    timeoutMs,
    theme,
    jarvis,
  };
});
