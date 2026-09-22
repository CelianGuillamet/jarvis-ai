<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const state = ref<"loading" | "signed-out" | "signed-in" | "error">("loading");
const error = ref("");
const googleAvailable = ref(false);
const busy = ref(false);

async function refresh() {
  state.value = "loading";
  error.value = "";
  try {
    const response = await fetch("/account/me", { credentials: "same-origin" });
    if (response.ok) {
      state.value = "signed-in";
      return;
    }
    if (response.status !== 401) throw new Error();
    const options = await fetch("/account/sign-in-options");
    if (!options.ok) throw new Error();
    const data: unknown = await options.json();
    googleAvailable.value =
      typeof data === "object" &&
      data !== null &&
      "google" in data &&
      data.google === true;
    state.value = "signed-out";
    if (new URL(window.location.href).searchParams.has("error")) {
      error.value =
        "Connexion refusée. Utilisez le compte Google associé à votre invitation.";
    }
  } catch {
    error.value =
      "Impossible de vérifier votre connexion. Réessayez dans un instant.";
    state.value = "error";
  }
}

async function signIn() {
  busy.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        callbackURL: window.location.href,
      }),
    });
    const data: unknown = await response.json();
    if (
      !response.ok ||
      typeof data !== "object" ||
      data === null ||
      !("url" in data) ||
      typeof data.url !== "string"
    )
      throw new Error();
    const destination = new URL(data.url);
    if (destination.origin !== "https://accounts.google.com") throw new Error();
    window.location.assign(destination.href);
  } catch {
    error.value =
      "La connexion n’a pas abouti. Vérifiez votre invitation puis réessayez.";
    busy.value = false;
  }
}

async function signOut() {
  busy.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error();
    // A full reload clears account data retained by mounted views and stores.
    window.location.reload();
  } catch {
    error.value = "La déconnexion a échoué. Réessayez.";
    busy.value = false;
  }
}

function onSessionExpired() {
  void refresh();
}
onUnmounted(() =>
  window.removeEventListener("jarvis:session-expired", onSessionExpired),
);
onMounted(() => {
  window.addEventListener("jarvis:session-expired", onSessionExpired);
  void refresh();
});
</script>

<template>
  <template v-if="state === 'signed-in'">
    <div class="auth-session">
      <button type="button" :disabled="busy" @click="signOut">
        Se déconnecter</button
      ><span v-if="error" role="alert">{{ error }}</span>
    </div>
    <slot />
  </template>
  <main v-else class="auth-screen">
    <section class="auth-card" aria-labelledby="login-title">
      <p class="auth-eyebrow">JARVIS · BÊTA PRIVÉE</p>
      <h1 id="login-title">Votre quotidien, au même endroit.</h1>
      <p v-if="state === 'loading'" role="status">
        Vérification de votre connexion…
      </p>
      <template v-else-if="state === 'signed-out'">
        <p>Connectez-vous avec le compte Google associé à votre invitation.</p>
        <p>La connexion ne donne pas accès à vos e-mails ni à votre agenda.</p>
        <button
          v-if="googleAvailable"
          type="button"
          :disabled="busy"
          @click="signIn"
        >
          {{ busy ? "Connexion en cours…" : "Continuer avec Google" }}
        </button>
        <p v-else role="status">
          La connexion n’est pas encore disponible sur cette installation.
        </p>
      </template>
      <p v-if="error" role="alert">{{ error }}</p>
      <button v-if="state === 'error'" type="button" @click="refresh">
        Réessayer
      </button>
    </section>
  </main>
</template>

<style scoped>
.auth-screen {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: #f5f5f4;
  color: #1c1917;
}
.auth-card {
  width: min(100%, 30rem);
  padding: 2rem;
  background: white;
  border: 1px solid #d6d3d1;
  border-radius: 1rem;
}
h1 {
  margin: 1rem 0;
  font-size: 2rem;
  line-height: 1.2;
}
p {
  margin: 1rem 0;
  line-height: 1.6;
}
.auth-eyebrow {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}
button {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #1c1917;
  color: white;
  font-weight: 600;
}
button:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.auth-session {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: flex-end;
  padding: 0.5rem 1rem;
}
</style>
