import type {
  PendingActionView,
  JarvisQuickAction,
  JarvisSuggestion,
} from './assistant-types';
import { normalizeIntentText } from './intent-text';
import { ToolCall } from '../tools/tools';

export function extractSuggestedCommandsFromToolResult(text: string) {
  if (!text) return [];

  const lines = text.split('\n');
  const start = lines.findIndex((line) =>
    /^Commandes suggerees/i.test(line.trim()),
  );
  if (start < 0) return [];

  const out: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    if (!line.startsWith('- ')) break;
    out.push(line.slice(2).trim());
  }

  return out.slice(0, 5);
}

export function combineChoiceLists(...lists: Array<string[] | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const item of list ?? []) {
      const clean = item.trim();
      if (!clean) continue;

      const key = normalizeIntentText(clean);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      out.push(clean);
    }
  }

  return out.slice(0, 5);
}

export function buildQuickActions(input: {
  sessionId: string;
  pendingAction: {
    id: string;
    call: Extract<ToolCall, { type: 'tool' }>;
  } | null;
  googleConnected: boolean;
  gmailConnected: boolean;
  openTodos: number;
  openShopping: number;
  unreadEmails: number | null;
  eventsToday: number | null;
  nextEventTitle?: string | null;
  activeMissions?: number;
  actionAuditCount?: number;
  workflowSuggestion?: string | null;
}): JarvisQuickAction[] {
  const actions: JarvisQuickAction[] = [];

  if (input.pendingAction) {
    actions.push({
      kind: 'confirm',
      label: 'Confirmer l’action en attente',
      prompt: 'oui',
    });
  }

  if (!input.googleConnected) {
    actions.push({
      kind: 'link',
      label: 'Connecter Google',
      href: `/auth/google?sessionId=${encodeURIComponent(input.sessionId)}`,
    });
  }

  if ((input.unreadEmails ?? 0) > 0 && input.gmailConnected) {
    actions.push({
      kind: 'chat',
      label: 'Résumer les emails non lus',
      prompt: 'Résume mes emails non lus',
    });
  }

  if ((input.eventsToday ?? 0) > 0) {
    actions.push({
      kind: 'chat',
      label: 'Afficher mon agenda du jour',
      prompt: "Montre-moi mon agenda d'aujourd'hui",
    });
  }

  if (input.nextEventTitle) {
    actions.push({
      kind: 'chat',
      label: 'Préparer la prochaine mission',
      prompt: `Prépare un plan de mission pour ${input.nextEventTitle}`,
    });
  }

  if ((input.activeMissions ?? 0) > 0) {
    actions.push({
      kind: 'chat',
      label: 'Voir les missions actives',
      prompt: 'Liste mes missions actives',
    });
  }

  if ((input.actionAuditCount ?? 0) > 0) {
    actions.push({
      kind: 'chat',
      label: 'Voir l’audit récent',
      prompt: 'Montre-moi l’historique des actions',
    });
  }

  if (input.workflowSuggestion) {
    actions.push({
      kind: 'chat',
      label: 'Relancer une routine',
      prompt: input.workflowSuggestion,
    });
  }

  if (input.openTodos > 0) {
    actions.push({
      kind: 'chat',
      label: 'Revoir les todos',
      prompt: 'Liste mes todos',
    });
  }

  if (input.openShopping > 0) {
    actions.push({
      kind: 'chat',
      label: 'Voir les courses',
      prompt: 'Liste mes courses',
    });
  }

  if (!actions.length) {
    actions.push({
      kind: 'chat',
      label: 'Lancer un briefing',
      prompt: 'Fais mon briefing du jour',
    });
  }

  const deduped: JarvisQuickAction[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    const key = `${action.kind}|${action.label}|${action.prompt ?? ''}|${action.href ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }

  return deduped.slice(0, 5);
}

export function buildProactiveSuggestions(input: {
  sessionId: string;
  pendingAction: PendingActionView | null;
  googleConnected: boolean;
  unreadEmails: number | null;
  nextEvent: { title: string; when: Date } | null;
  activeMission: {
    objective: string;
    summary: string;
    nextStep: string | null;
  } | null;
  openTodos: number;
  workflowSuggestion?: string | null;
}): JarvisSuggestion[] {
  const compact = (value: string, max = 140) => {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1)}…`;
  };

  const suggestions: JarvisSuggestion[] = [];

  if (input.pendingAction) {
    suggestions.push({
      title: 'Validation en attente',
      detail: input.pendingAction.summary,
      tone: input.pendingAction.risk === 'high' ? 'warn' : 'neutral',
      prompt: 'oui',
    });
  }

  if (!input.googleConnected) {
    suggestions.push({
      title: 'Connexion incomplète',
      detail:
        'Google n’est pas encore connecté pour cette session, ce qui limite Calendar et Gmail.',
      tone: 'neutral',
      href: `/auth/google?sessionId=${encodeURIComponent(input.sessionId)}`,
    });
  }

  if (input.activeMission) {
    suggestions.push({
      title: 'Mission active',
      detail: input.activeMission.nextStep
        ? `${input.activeMission.objective} · prochaine étape: ${compact(input.activeMission.nextStep, 110)}`
        : `${input.activeMission.objective} · ${compact(input.activeMission.summary, 110)}`,
      tone: 'neutral',
      prompt: `Aide-moi à avancer sur ${input.activeMission.objective}`,
    });
  }

  if (input.workflowSuggestion) {
    suggestions.push({
      title: 'Routine détectée',
      detail: `Une suite d’action probable a été reconnue: ${compact(input.workflowSuggestion, 105)}`,
      tone: 'neutral',
      prompt: input.workflowSuggestion,
    });
  }

  if (input.nextEvent) {
    const diffMinutes = Math.round(
      (input.nextEvent.when.getTime() - Date.now()) / 60_000,
    );
    suggestions.push({
      title: diffMinutes <= 90 ? 'Rendez-vous proche' : 'Agenda du jour',
      detail:
        diffMinutes <= 90
          ? `${input.nextEvent.title} commence bientôt. Vérifie ce qui doit être prêt.`
          : `${input.nextEvent.title} reste le prochain jalon visible aujourd’hui.`,
      tone: diffMinutes <= 90 ? 'warn' : 'neutral',
      prompt: "Montre-moi mon agenda d'aujourd'hui",
    });
  }

  if ((input.unreadEmails ?? 0) > 0) {
    suggestions.push({
      title: 'Emails à trier',
      detail:
        input.unreadEmails === 1
          ? '1 email non lu peut encore changer les priorités du moment.'
          : `${input.unreadEmails} emails non lus peuvent perturber l’exécution si tu les laisses s’accumuler.`,
      tone: (input.unreadEmails ?? 0) >= 3 ? 'warn' : 'neutral',
      prompt: 'Résume mes emails non lus',
    });
  }

  if (input.openTodos >= 5) {
    suggestions.push({
      title: 'Charge ouverte élevée',
      detail: `${input.openTodos} todos restent ouverts. Un tri rapide éviterait la dispersion.`,
      tone: 'warn',
      prompt: 'Liste mes todos',
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      title: 'Cap stable',
      detail:
        'Aucun point chaud immédiat détecté. Jarvis peut repartir d’un briefing court.',
      tone: 'ok',
      prompt: 'Fais mon briefing du jour',
    });
  }

  const deduped: JarvisSuggestion[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.title}|${suggestion.prompt ?? ''}|${suggestion.href ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(suggestion);
  }

  return deduped.slice(0, 4);
}

export function summarizeActivityResult(result: string | null | undefined) {
  const text = (result || '').trim();
  if (!text) return '';
  if (text.startsWith('PENDING:')) {
    return 'Action sensible en attente de confirmation.';
  }
  if (text.startsWith('ASK:')) {
    const awaiting = text.slice(4).trim() || 'generic';
    return `Jarvis attend une precision (${awaiting}).`;
  }
  if (text.startsWith('ERROR:')) {
    return `Erreur: ${text.slice(6).trim()}`;
  }
  return text;
}
