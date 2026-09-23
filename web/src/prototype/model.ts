export type Area = 'today' | 'inbox' | 'assistant' | 'activity' | 'settings';
export type Scenario =
  | 'normal'
  | 'empty'
  | 'unavailable'
  | 'expired'
  | 'unknown';
export type SendState = 'draft' | 'unknown' | 'sent';
export interface Task {
  id: number;
  title: string;
  done: boolean;
}
export interface Activity {
  id: number;
  title: string;
  detail: string;
}

export function createPrototypeState(scenario: Scenario = 'normal') {
  return {
    connected: scenario !== 'expired',
    unavailable: scenario === 'unavailable',
    sendState: (scenario === 'unknown' ? 'unknown' : 'draft') as SendState,
    tasks: (scenario === 'empty'
      ? []
      : [
          { id: 1, title: 'Préparer le rendez-vous de demain', done: false },
          { id: 2, title: 'Choisir un créneau pour le déjeuner', done: false },
        ]) as Task[],
    activities: [] as Activity[],
    note: '',
    nextId: 3,
    hasEmail: scenario !== 'empty',
    hasEvents: scenario !== 'empty',
  };
}
export type PrototypeState = ReturnType<typeof createPrototypeState>;

export function addTask(state: PrototypeState, title: string): boolean {
  const cleaned = title.trim();
  if (!cleaned || cleaned.length > 160 || state.unavailable) return false;
  state.tasks.push({ id: state.nextId++, title: cleaned, done: false });
  state.activities.unshift({
    id: state.nextId++,
    title: 'Tâche ajoutée',
    detail: cleaned,
  });
  return true;
}

export function confirmSend(state: PrototypeState): boolean {
  if (
    !state.connected ||
    state.unavailable ||
    !state.hasEmail ||
    state.sendState !== 'draft'
  )
    return false;
  state.sendState = 'sent';
  state.activities.unshift({
    id: state.nextId++,
    title: 'Réponse envoyée (simulation)',
    detail: 'Camille — Déjeuner jeudi',
  });
  return true;
}

export function reconcileSend(state: PrototypeState): boolean {
  if (!state.connected || state.unavailable || state.sendState !== 'unknown')
    return false;
  state.sendState = 'sent';
  state.activities.unshift({
    id: state.nextId++,
    title: 'Envoi retrouvé (simulation)',
    detail: 'Réponse déjà envoyée à Camille. Aucun nouvel envoi.',
  });
  return true;
}
