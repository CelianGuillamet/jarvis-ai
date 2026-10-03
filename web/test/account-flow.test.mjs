import { test, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadAccountComponents } from "./helpers/components.mjs";

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://app.example.test/",
});
for (const name of [
  "window",
  "document",
  "localStorage",
  "Element",
  "HTMLElement",
  "SVGElement",
])
  globalThis[name] = dom.window[name];
const { createApp, h, nextTick } = await import("vue");
const { createPinia, setActivePinia } = await import("pinia");
const { modules, cleanup } = await loadAccountComponents();
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  dom.window.close();
  await cleanup();
});

async function settle() {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
function button(text) {
  return [...document.querySelectorAll("button")].find((node) =>
    node.textContent.includes(text),
  );
}

function fixture({
  completed = false,
  saveFails = false,
  signedOut = false,
  connected = false,
  revocationPending = false,
} = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const preferences = {
    displayTimezone: "Europe/Paris",
    theme: "dark",
    onboardingCompleted: completed,
  };
  const requests = [];
  let failSave = saveFails;
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, ...init });
    if (url.endsWith("/account/me"))
      return new Response(
        JSON.stringify({
          id: "owner",
          name: "Invité",
          email: "invite@example.test",
        }),
        { status: signedOut ? 401 : 200 },
      );
    if (url.endsWith("/account/sign-in-options"))
      return new Response('{"google":true}');
    if (url.endsWith("/auth/google/disconnect")) {
      connected = false;
      return new Response(
        JSON.stringify({ connected: false, revocationPending }),
      );
    }
    if (url.endsWith("/account/preferences")) {
      if (init.method === "POST") {
        if (failSave) return new Response("{}", { status: 503 });
        Object.assign(preferences, JSON.parse(init.body));
      }
      return new Response(JSON.stringify(preferences));
    }
    throw new Error(`Unexpected request ${url}`);
  };
  // Status data is a component fixture; transport/schema safety has separate tests.
  const status = modules.useStatusStore();
  status.refresh = async () => {
    status.snapshot = {
      integrations: {
        googleConnected: connected,
        gmailConnected: connected,
        calendarConnected: connected,
      },
    };
  };
  const app = createApp({
    render: () =>
      h(
        modules.AuthGate,
        {},
        { default: () => h("p", { id: "private-app" }, "Application privée") },
      ),
  });
  app.use(pinia);
  app.mount("#root");
  return {
    app,
    requests,
    preferences,
    allowSave: () => {
      failSave = false;
    },
    store: modules.usePreferencesStore(),
  };
}

test("new account stays in onboarding after a failed save and enters the app after confirmed persistence", async () => {
  const f = fixture({ saveFails: true });
  try {
    await settle();
    assert.match(document.body.textContent, /Bienvenue dans Jarvis/);
    assert.equal(document.querySelector("#private-app"), null);
    assert.equal(document.querySelector('input[placeholder="default"]'), null);
    assert.doesNotMatch(
      document.body.textContent,
      /Session ID|API base URL|Timeout \(ms\)/,
    );
    button("Enregistrer et commencer").click();
    await settle();
    assert.equal(document.querySelector("#private-app"), null);
    assert.equal(f.store.current.onboardingCompleted, false);
    assert.match(
      document.body.textContent,
      /enregistrement ne peut pas être confirmé/,
    );
    f.allowSave();
    button("Enregistrer et commencer").click();
    await settle();
    assert.ok(document.querySelector("#private-app"));
    assert.equal(f.preferences.onboardingCompleted, true);
    assert.ok(
      f.requests.every(
        (request) =>
          request.url.startsWith("https://api.example.test/") &&
          request.credentials === "include",
      ),
    );
  } finally {
    f.app.unmount();
  }
});

test("returning account skips onboarding and applies persisted theme and display timezone", async () => {
  const f = fixture({ completed: true });
  try {
    await settle();
    assert.ok(document.querySelector("#private-app"));
    await f.store.save({
      displayTimezone: "America/Montreal",
      theme: "light",
      onboardingCompleted: true,
    });
    assert.ok(document.documentElement.classList.contains("light"));
    assert.match(f.store.formatDate("2026-01-01T12:00:00Z", true), /07:00/);
    assert.equal(f.store.formatDate("invalid"), "Date indisponible");
  } finally {
    f.app.unmount();
  }
});

test("signed-out visitor sees invitation-only sign-in and cannot mount private content", async () => {
  const f = fixture({ signedOut: true });
  try {
    await settle();
    assert.equal(document.querySelector("#private-app"), null);
    assert.match(
      document.body.textContent,
      /compte Google associé à votre invitation/,
    );
    assert.ok(button("Continuer avec Google"));
    assert.equal(
      f.requests.filter((request) =>
        request.url.endsWith("/account/preferences"),
      ).length,
      0,
    );
  } finally {
    f.app.unmount();
  }
});

for (const connected of [false, true]) {
  test(`Google ${connected ? "reconnection" : "connection"} uses the configured API URL without exposing credentials`, async () => {
    const f = fixture({ connected });
    const previousOpen = globalThis.window.open;
    let navigation;
    globalThis.window.open = (...args) => {
      navigation = args;
      return null;
    };
    try {
      await settle();
      button(connected ? "Reconnecter Google" : "Connecter Google").click();
      assert.deepEqual(navigation, [
        "https://api.example.test/auth/google?sessionId=default",
        "_blank",
        "noopener,noreferrer",
      ]);
    } finally {
      globalThis.window.open = previousOpen;
      f.app.unmount();
    }
  });
}

test("Google disconnect preserves Jarvis access and explains pending provider revocation", async () => {
  const f = fixture({ connected: true, revocationPending: true });
  try {
    await settle();
    button("Déconnecter Google").click();
    await settle();
    assert.match(document.body.textContent, /L’accès de Jarvis est retiré/);
    assert.ok(button("Connecter Google"));
    assert.equal(button("Déconnecter Google"), undefined);
    const revoke = document.querySelector(
      'a[href="https://myaccount.google.com/connections"]',
    );
    assert.ok(revoke);
    assert.equal(f.store.current.onboardingCompleted, false);
    assert.equal(
      f.requests.filter((request) => request.url.includes("/sign-out")).length,
      0,
    );
  } finally {
    f.app.unmount();
  }
});

test('invalid display timezone blocks completion before any preference mutation', async () => {
  const f = fixture();
  try {
    await settle();
    const input = document.querySelector('input[placeholder="Europe/Paris"]');
    input.value = 'Unknown/Zone';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    await nextTick();
    assert.equal(button('Enregistrer et commencer').disabled, true);
    assert.match(document.body.textContent, /Indiquez un fuseau valide/);
    assert.equal(f.requests.filter(request => request.method === 'POST').length, 0);
  } finally { f.app.unmount(); }
});
