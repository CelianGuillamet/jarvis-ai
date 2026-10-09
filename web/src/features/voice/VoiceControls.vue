<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useAppStore } from "@/stores/appStore";
import { useChatStore } from "@/stores/chatStore";
import type { VoiceStatus } from "@/core/contracts/v1";
import { Dictation, type DictationPhase } from "./dictation";
import { Speaker } from "./speaker";
import { encodeWav16k } from "./wav";
import { playWav, startBrowserCapture } from "./browserAudio";

const emit = defineEmits<{ transcript: [text: string] }>();
const app = useAppStore();
const chat = useChatStore();

const status = ref<VoiceStatus | null>(null);
const phase = ref<DictationPhase>("idle");
const speaking = ref(false);
const speakAloud = ref(false);
const error = ref("");
const note = ref("");
const elapsed = ref(0);
let ticker: number | null = null;
let alive = true;

const stopTicker = () => {
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
};

const dictation = new Dictation({
  capture: startBrowserCapture,
  encode: encodeWav16k,
  transcribe: (audio, signal) => app.jarvis.transcribe(audio, signal),
  onPhase: next => {
    phase.value = next;
    stopTicker();
    if (next === "listening") {
      elapsed.value = 0;
      ticker = window.setInterval(() => { elapsed.value += 1; }, 1000);
    }
  },
  onTranscript: text => {
    note.value = "Vérifiez et corrigez le texte avant de l’envoyer.";
    emit("transcript", text);
  },
  onError: message => { error.value = message; },
});

const speaker = new Speaker({
  synthesize: (text, signal) => app.jarvis.speak(text, signal),
  play: playWav,
  onSpeaking: value => { speaking.value = value; },
  onError: message => { error.value = message; },
});

const lastAssistant = computed(() => {
  const last = chat.messages[chat.messages.length - 1];
  return last && last.role === "assistant" ? last : null;
});
let spokenId = lastAssistant.value?.id ?? null;

watch(lastAssistant, message => {
  if (!message || message.id === spokenId) return;
  spokenId = message.id;
  if (speakAloud.value && status.value?.speech === "ready") void speaker.speak(message.text);
});

watch(speakAloud, enabled => {
  if (enabled) spokenId = lastAssistant.value?.id ?? null;
  else speaker.stop();
});

const purge = () => {
  dictation.cancel();
  speaker.stop();
  error.value = "";
  note.value = "";
};

watch(() => [app.accountEpoch, app.sessionId], purge, { flush: "sync" });

const toggleListening = () => {
  error.value = "";
  note.value = "";
  if (phase.value === "listening") void dictation.stop();
  else if (phase.value === "idle") {
    speaker.stop();
    void dictation.start();
  }
};

onMounted(async () => {
  window.addEventListener("jarvis:session-expired", purge);
  try {
    const next = await app.jarvis.voiceStatus();
    if (alive) status.value = next;
  } catch {
    /* Voice is optional: the chat works without it. */
  }
});

onUnmounted(() => {
  alive = false;
  window.removeEventListener("jarvis:session-expired", purge);
  stopTicker();
  purge();
});

const available = computed(
  () => status.value !== null && (status.value.transcription !== "disabled" || status.value.speech !== "disabled"),
);
</script>

<template>
  <div v-if="available" class="flex flex-wrap items-center gap-2" role="group" aria-label="Voix locale">
    <template v-if="status?.transcription === 'ready'">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-border/60 transition hover:bg-muted/60 disabled:opacity-50"
        :class="phase === 'listening' ? 'bg-red-500/15 text-red-300' : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="phase === 'listening'"
        :disabled="phase === 'requesting' || phase === 'transcribing'"
        @click="toggleListening"
      >
        <span v-if="phase === 'listening'" class="size-2 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
        {{ phase === "listening" ? "Arrêter et transcrire" : "Parler" }}
      </button>
    </template>
    <p v-else-if="status?.transcription === 'unavailable'" class="text-xs text-muted-foreground">
      Dictée indisponible : moteur local introuvable.
    </p>

    <label v-if="status?.speech === 'ready'" class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <input v-model="speakAloud" type="checkbox" />
      Lire les réponses à voix haute
    </label>
    <p v-else-if="status?.speech === 'unavailable'" class="text-xs text-muted-foreground">
      Lecture vocale indisponible : moteur local introuvable.
    </p>
    <button
      v-if="speaking"
      type="button"
      class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border/60 transition hover:bg-muted/60 hover:text-foreground"
      @click="speaker.stop()"
    >
      Arrêter la lecture
    </button>

    <p class="w-full text-xs text-muted-foreground" role="status" aria-live="polite">
      <template v-if="phase === 'requesting'">Autorisation du micro…</template>
      <template v-else-if="phase === 'listening'">Écoute en cours ({{ elapsed }} s sur 30). Parlez, puis arrêtez.</template>
      <template v-else-if="phase === 'transcribing'">Transcription locale…</template>
      <template v-else-if="note">{{ note }}</template>
    </p>
    <p v-if="error" class="w-full text-xs" role="alert">{{ error }}</p>
  </div>
</template>
