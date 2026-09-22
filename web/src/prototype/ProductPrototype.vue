<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import {
  addTask,
  confirmSend,
  createPrototypeState,
  reconcileSend,
  type Area,
  type Scenario,
} from './model';

const state = ref(createPrototypeState());
const area = ref<Area>('today');
const scenario = ref<Scenario>('normal');
const step = ref(0);
const heading = ref<HTMLElement>();
const reviewTrigger = ref<HTMLButtonElement>();
const replyInput = ref<HTMLTextAreaElement>();
const suggestionHeading = ref<HTMLElement>();
const suggestionTrigger = ref<HTMLButtonElement>();
const taskTitle = ref('');
const timezone = ref('Europe/Paris');
const announcement = ref('');
const reviewing = ref(false);
const suggested = ref(false);
const reply = ref('Bonjour Camille, jeudi à 12 h 30 me convient. À bientôt !');
const navigation: { id: Area; label: string; symbol: string }[] = [
  { id: 'today', label: 'Aujourd’hui', symbol: '◷' },
  { id: 'inbox', label: 'Courrier', symbol: '✉' },
  { id: 'assistant', label: 'Assistant', symbol: '✧' },
  { id: 'activity', label: 'Activité', symbol: '☷' },
  { id: 'settings', label: 'Réglages', symbol: '⚙' },
];
const title = computed(
  () => navigation.find((item) => item.id === area.value)?.label ?? 'Jarvis',
);
const remaining = computed(
  () => state.value.tasks.filter((task) => !task.done).length,
);
async function focusHeading() {
  await nextTick();
  heading.value?.focus();
}
function navigate(destination: Area) {
  area.value = destination;
  reviewing.value = false;
  announcement.value = '';
  void focusHeading();
}
function nextStep() {
  step.value++;
  void focusHeading();
}
function connect(value: boolean) {
  state.value.connected = value;
  nextStep();
}
function resetScenario() {
  state.value = createPrototypeState(scenario.value);
  step.value = 3;
  reviewing.value = false;
  suggested.value = false;
  taskTitle.value = '';
  reply.value = 'Bonjour Camille, jeudi à 12 h 30 me convient. À bientôt !';
  announcement.value = '';
  area.value =
    scenario.value === 'unknown' || scenario.value === 'expired'
      ? 'inbox'
      : 'today';
  void focusHeading();
}
function saveTask() {
  if (addTask(state.value, taskTitle.value)) {
    taskTitle.value = '';
    announcement.value = 'Tâche ajoutée.';
  }
}
async function openReview() {
  reviewing.value = true;
  await nextTick();
  replyInput.value?.focus();
}
async function openSuggestion() {
  suggested.value = true;
  await nextTick();
  suggestionHeading.value?.focus();
}
async function cancelSuggestion() {
  suggested.value = false;
  await nextTick();
  suggestionTrigger.value?.focus();
}
function send() {
  if (!reply.value.trim()) return;
  if (confirmSend(state.value)) {
    reviewing.value = false;
    announcement.value =
      'Réponse envoyée dans la simulation. Retrouvez-la dans Activité.';
    void focusHeading();
  }
}
function reconcile() {
  if (reconcileSend(state.value)) {
    announcement.value =
      'Envoi retrouvé dans la simulation. Aucun nouvel envoi.';
    void focusHeading();
  }
}
async function cancelReview() {
  reviewing.value = false;
  await nextTick();
  reviewTrigger.value?.focus();
}
function recover() {
  state.value.unavailable = false;
  announcement.value = 'Données à nouveau disponibles dans la simulation.';
  void focusHeading();
}
function reconnect() {
  state.value.connected = true;
  announcement.value = 'Google reconnecté dans la simulation.';
  void focusHeading();
}
function createSuggestion() {
  if (addTask(state.value, 'Préparer trois questions pour mon rendez-vous')) {
    void cancelSuggestion();
    announcement.value = 'Tâche ajoutée. Elle est disponible dans Aujourd’hui.';
  }
}
</script>

<template>
  <a class="skip-link" href="#workspace">Aller au contenu</a>
  <div class="research-bar">
    <span
      ><strong>Prototype</strong> · Données fictives, aucune action réelle. Ne
      saisissez pas de données personnelles.</span
    >
    <label
      >Scénario
      <select v-model="scenario" @change="resetScenario">
        <option value="normal">Journée type</option>
        <option value="empty">Compte vide</option>
        <option value="unavailable">Données indisponibles</option>
        <option value="expired">Google déconnecté</option>
        <option value="unknown">Envoi incertain</option>
      </select></label
    >
    <button
      class="quiet"
      @click="
        step = 0;
        focusHeading();
      "
    >
      Revoir l’accueil
    </button>
  </div>
  <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

  <main v-if="step < 3" id="workspace" class="welcome">
    <div class="brand">Jarvis<span>Votre journée, plus claire.</span></div>
    <p class="muted">Invitation privée · Étape {{ step + 1 }} sur 3</p>
    <template v-if="step === 0">
      <h1 ref="heading" tabindex="-1">Un peu moins à garder en tête.</h1>
      <p>
        Vos tâches, votre courrier et les prochaines étapes, au même endroit.
        Commencez avec une invitation.
      </p>
      <button class="primary" @click="nextStep">
        Simuler la connexion avec Google
      </button>
      <p class="muted">
        Cette démonstration ne vous connecte à aucun compte et n’ouvre aucun
        accès à votre courrier.
      </p>
    </template>
    <template v-else-if="step === 1">
      <h1 ref="heading" tabindex="-1">
        Choisissez ce que Jarvis peut vous aider à suivre.
      </h1>
      <p>
        La connexion Google permettra de lire votre courrier et votre agenda.
        Toute action proposée sera présentée avant confirmation.
      </p>
      <p>
        Vous pouvez déjà organiser vos tâches et vos notes sans connecter
        Google.
      </p>
      <div class="actions">
        <button class="primary" @click="connect(true)">
          Simuler la connexion du courrier et de l’agenda</button
        ><button @click="connect(false)">Continuer sans Google</button>
      </div>
    </template>
    <template v-else>
      <h1 ref="heading" tabindex="-1">À votre rythme.</h1>
      <label class="field"
        >Fuseau horaire<select v-model="timezone">
          <option>Europe/Paris</option>
          <option>Europe/London</option>
          <option>America/Montreal</option>
        </select></label
      >
      <p>
        Commencez par ajouter une tâche. Rien n’est envoyé et aucune
        notification n’est programmée.
      </p>
      <button class="primary" @click="nextStep">Ouvrir ma journée</button>
    </template>
  </main>

  <div v-else class="workspace-shell">
    <aside class="sidebar">
      <div class="brand">Jarvis<span>Un espace pour votre journée</span></div>
      <nav aria-label="Navigation principale">
        <button
          v-for="item in navigation"
          :key="item.id"
          :aria-current="area === item.id ? 'page' : undefined"
          @click="navigate(item.id)"
        >
          <span aria-hidden="true">{{ item.symbol }}</span
          >{{ item.label }}
        </button>
      </nav>
      <p class="profile">
        Alex · Compte de démonstration<span>Bêta privée</span>
      </p>
    </aside>
    <main id="workspace" class="workspace">
      <header class="page-heading">
        <div>
          <p class="muted">Mardi 22 septembre · Exemple de journée</p>
          <h1 ref="heading" tabindex="-1">{{ title }}</h1>
        </div>
        <span class="connection">{{
          state.connected
            ? 'Google connecté (simulation)'
            : 'Sans connexion Google'
        }}</span>
      </header>
      <div v-if="announcement" class="notice">{{ announcement }}</div>
      <section v-if="state.unavailable" class="error" role="alert">
        <h2>Impossible de charger vos données.</h2>
        <p>
          Vos éléments ne sont pas considérés comme vides. Réessayez pour
          retrouver votre journée.
        </p>
        <button @click="recover">Réessayer</button>
      </section>

      <template v-else-if="area === 'today'">
        <p class="intro">
          {{
            remaining
              ? `${remaining} tâches à votre rythme. Commencez par celle qui compte.`
              : 'De la place pour ce qui compte aujourd’hui.'
          }}
        </p>
        <div class="day-grid">
          <section class="panel">
            <div class="section-heading">
              <h2>Mes tâches</h2>
              <span>{{ remaining }} à faire</span>
            </div>
            <form class="inline-form" @submit.prevent="saveTask">
              <label class="sr-only" for="task">Nouvelle tâche</label
              ><input
                id="task"
                v-model="taskTitle"
                maxlength="160"
                placeholder="Qu’aimeriez-vous avancer ?"
                required
              /><button class="primary" :disabled="!taskTitle.trim()">
                Ajouter
              </button>
            </form>
            <ul v-if="state.tasks.length" class="task-list">
              <li v-for="task in state.tasks" :key="task.id">
                <label :class="{ completed: task.done }"
                  ><input
                    v-model="task.done"
                    type="checkbox"
                    @change="
                      announcement = task.done
                        ? 'Tâche terminée.'
                        : 'Tâche remise à faire.'
                    "
                  /><span>{{ task.title }}</span></label
                >
              </li>
            </ul>
            <p v-else class="empty">
              Aucune tâche pour le moment. Ajoutez une première étape, même
              petite.
            </p>
          </section>
          <section class="agenda">
            <h2>Dans mon agenda</h2>
            <template v-if="state.connected"
              ><p class="muted">Exemple fictif · {{ timezone }}</p>
              <div v-if="state.hasEvents" class="appointment">
                <strong>10:30</strong>
                <div>
                  <h3>Point de la semaine</h3>
                  <p>30 minutes · Agenda personnel</p>
                </div>
              </div>
              <p v-else>Aucun rendez-vous prévu.</p>
              <p class="muted">
                Gardez un peu d’espace entre deux rendez-vous.
              </p></template
            ><template v-else
              ><p>Connectez Google pour retrouver vos rendez-vous ici.</p>
              <button @click="navigate('settings')">
                Gérer ma connexion
              </button></template
            >
          </section>
        </div>
        <section class="panel note-panel">
          <h2>À garder sous la main</h2>
          <label class="field" for="note"
            >Ma note du jour<textarea
              id="note"
              v-model="state.note"
              rows="3"
              maxlength="2000"
              placeholder="Une idée, un détail à ne pas oublier…"
            />
          </label>
          <p class="muted">Conservée pendant cette démonstration uniquement.</p>
        </section>
      </template>

      <template v-else-if="area === 'inbox'">
        <p class="intro">
          Relisez, décidez, puis confirmez. Un message à la fois.
        </p>
        <section v-if="!state.connected" class="panel">
          <h2>Reconnectez Google pour retrouver votre courrier.</h2>
          <p>Vos tâches et vos notes restent accessibles.</p>
          <button class="primary" @click="reconnect">
            Simuler la reconnexion
          </button>
        </section>
        <section v-else-if="!state.hasEmail" class="panel">
          <h2>Aucun message à examiner.</h2>
          <p>
            Votre prochain message apparaîtra ici lorsque le courrier sera
            synchronisé.
          </p>
          <button @click="navigate('today')">Revenir à ma journée</button>
        </section>
        <article v-else class="panel mail">
          <p class="muted">Camille · Message fictif</p>
          <h2>Déjeuner jeudi</h2>
          <p>
            Bonjour Alex, est-ce que jeudi à 12 h 30 vous conviendrait pour
            déjeuner ?
          </p>
          <section
            v-if="state.sendState === 'unknown'"
            class="error"
            role="alert"
          >
            <h3>Résultat de l’envoi inconnu</h3>
            <p>
              La connexion a été interrompue. La réponse a peut-être été
              envoyée. Vérifiez son statut avant toute nouvelle tentative.
            </p>
            <button @click="reconcile">Vérifier le statut (simulation)</button>
          </section>
          <section v-else-if="state.sendState === 'sent'" class="success">
            <h3>Réponse envoyée (simulation)</h3>
            <p>{{ reply }}</p>
            <button @click="navigate('activity')">Voir dans Activité</button>
          </section>
          <template v-else
            ><button
              v-if="!reviewing"
              ref="reviewTrigger"
              class="primary"
              @click="openReview"
            >
              Préparer une réponse
            </button>
            <section v-else class="review">
              <h3>Relire avant l’envoi</h3>
              <p><strong>À :</strong> Camille &lt;camille@example.test&gt;</p>
              <label class="field"
                >Votre réponse<textarea
                  ref="replyInput"
                  v-model="reply"
                  rows="4"
                  maxlength="4000"
                />
              </label>
              <p>Cette action ne peut pas être annulée après un envoi réel.</p>
              <div class="actions">
                <button class="primary" :disabled="!reply.trim()" @click="send">
                  Confirmer l’envoi simulé</button
                ><button @click="cancelReview">Annuler</button>
              </div>
            </section></template
          >
        </article>
      </template>

      <template v-else-if="area === 'assistant'">
        <p class="intro">Une intention, une prochaine étape.</p>
        <section class="panel assistant">
          <h2>Sur quoi voulez-vous avancer ?</h2>
          <p>
            Essayez une proposition guidée. Cette démonstration ne contacte
            aucun modèle d’intelligence artificielle.
          </p>
          <button
            v-if="!suggested"
            ref="suggestionTrigger"
            @click="openSuggestion"
          >
            Aidez-moi à préparer mon rendez-vous
          </button>
          <section v-else class="review">
            <h3 ref="suggestionHeading" tabindex="-1">Ajouter cette tâche ?</h3>
            <p>Préparer trois questions pour mon rendez-vous</p>
            <p class="muted">
              Elle sera ajoutée à Aujourd’hui. Aucun message ni invitation ne
              sera envoyé.
            </p>
            <div class="actions">
              <button class="primary" @click="createSuggestion">
                Ajouter la tâche</button
              ><button @click="cancelSuggestion">Annuler</button>
            </div>
          </section>
        </section>
      </template>

      <template v-else-if="area === 'activity'">
        <p class="intro">
          Ce qui a été fait et ce qui demande votre attention.
        </p>
        <section v-if="state.sendState === 'unknown'" class="error">
          <h2>Réponse à Camille : résultat inconnu</h2>
          <p>Aucun nouvel envoi ne sera tenté avant vérification.</p>
          <button :disabled="!state.connected" @click="reconcile">
            Vérifier le statut (simulation)</button
          ><button v-if="!state.connected" @click="navigate('settings')">
            Reconnecter Google
          </button>
        </section>
        <section class="panel">
          <h2>Actions récentes</h2>
          <ul v-if="state.activities.length" class="activity-list">
            <li v-for="event in state.activities" :key="event.id">
              <strong>{{ event.title }}</strong>
              <p>{{ event.detail }}</p>
            </li>
          </ul>
          <p v-else class="empty">
            Aucune action terminée pendant cette démonstration. Ajoutez une
            tâche ou examinez un message.
          </p>
        </section>
      </template>

      <template v-else>
        <p class="intro">Votre compte, vos préférences, vos choix.</p>
        <section class="panel">
          <h2>Mon compte</h2>
          <p>Alex · alex@example.test · Compte fictif</p>
          <label class="field"
            >Fuseau horaire<select v-model="timezone">
              <option>Europe/Paris</option>
              <option>Europe/London</option>
              <option>America/Montreal</option>
            </select></label
          >
        </section>
        <section class="panel">
          <h2>Connexion Google</h2>
          <p>
            {{
              state.connected
                ? 'Courrier et agenda connectés dans la simulation.'
                : 'Google est déconnecté. Les tâches et notes restent disponibles.'
            }}
          </p>
          <p>
            La connexion du compte et l’accès au courrier sont deux
            autorisations distinctes.
          </p>
          <button
            v-if="state.connected"
            @click="
              state.connected = false;
              announcement = 'Google déconnecté dans la simulation.';
            "
          >
            Déconnecter (simulation)</button
          ><button v-else class="primary" @click="reconnect">
            Connecter (simulation)
          </button>
        </section>
        <section class="panel">
          <h2>Mes données</h2>
          <p>
            Tout ce que vous saisissez ici reste en mémoire dans cette page. Un
            rechargement efface la démonstration. Les contrôles d’export et de
            suppression du vrai compte restent à implémenter avant la bêta.
          </p>
          <h3>Besoin d’aide ?</h3>
          <p>
            Pendant l’essai du prototype, signalez au modérateur l’étape et le
            message qui vous ont bloqué.
          </p>
        </section>
      </template>
    </main>
  </div>
</template>
