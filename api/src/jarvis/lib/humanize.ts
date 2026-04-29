import { DateTime } from 'luxon';
import { getGmailCategoryLabel } from '../../gmail/gmail-category';
import type { ToolExecutionPlan } from './execution-policy';
import type { ToolOnly } from '../tools/tool-registry';

export type HumanSpeechMode = 'tu' | 'vous';
export type HumanVerbosity = 'brief' | 'normal' | 'detailed';

export type HumanProfile = {
  speechMode: HumanSpeechMode;
  verbosity: HumanVerbosity;
  preferredName?: string;
  turnCount: number;
  updatedAt: number;
};

export function createHumanProfile(
  speechMode: HumanSpeechMode = 'tu',
  verbosity: HumanVerbosity = 'normal',
): HumanProfile {
  return {
    speechMode,
    verbosity,
    turnCount: 0,
    updatedAt: Date.now(),
  };
}

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function sanitizeName(candidate: string | undefined) {
  if (!candidate) return undefined;
  const cleaned = candidate
    .trim()
    .replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ'-]+/, '')
    .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ'-]+$/, '');

  if (!cleaned) return undefined;
  if (cleaned.length < 2 || cleaned.length > 30) return undefined;
  if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ'-]*$/.test(cleaned))
    return undefined;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

function detectPreferredName(inputText: string) {
  const patterns = [
    /\bje m['’]appelle\s+([a-zA-ZÀ-ÖØ-öø-ÿ'-]{2,30})\b/i,
    /\bmoi c['’]est\s+([a-zA-ZÀ-ÖØ-öø-ÿ'-]{2,30})\b/i,
    /\bappelle[- ]moi\s+([a-zA-ZÀ-ÖØ-öø-ÿ'-]{2,30})\b/i,
  ];
  for (const pattern of patterns) {
    const m = inputText.match(pattern);
    if (!m) continue;
    const name = sanitizeName(m[1]);
    if (name) return name;
  }
  return undefined;
}

export function updateHumanProfile(
  previous: HumanProfile,
  userText: string,
): HumanProfile {
  const n = normalize(userText);
  const next: HumanProfile = {
    ...previous,
    turnCount: previous.turnCount + 1,
    updatedAt: Date.now(),
  };

  if (
    /\b(tutoie[- ]moi|on peut se tutoyer|tu peux me tutoyer|tutoiement)\b/.test(
      n,
    )
  ) {
    next.speechMode = 'tu';
  }
  if (
    /\b(vouvoie[- ]moi|vouvoyez[- ]moi|on peut se vouvoyer|vouvoiement)\b/.test(
      n,
    )
  ) {
    next.speechMode = 'vous';
  }

  if (/\b(en bref|court|rapide|sans details|succinct)\b/.test(n)) {
    next.verbosity = 'brief';
  }
  if (/\b(detaille|detail|plus de details|explique|approfondis)\b/.test(n)) {
    next.verbosity = 'detailed';
  }
  if (/\b(normal|standard|comme d habitude)\b/.test(n)) {
    next.verbosity = 'normal';
  }

  const name = detectPreferredName(userText);
  if (name) next.preferredName = name;

  return next;
}

function pick(profile: HumanProfile, variants: string[]) {
  const idx = profile.turnCount % variants.length;
  return variants[idx];
}

function addressSuffix(profile: HumanProfile) {
  return profile.preferredName ? ` ${profile.preferredName}` : '';
}

function confirmQuestion(profile: HumanProfile) {
  return profile.speechMode === 'vous' ? 'Vous confirmez ?' : 'Tu confirmes ?';
}

function formatWhen(whenIso: string, tz = 'Europe/Paris') {
  const dt = DateTime.fromISO(whenIso, { zone: tz });
  if (!dt.isValid) return whenIso;
  return dt.toFormat("cccc dd LLLL yyyy 'a' HH:mm");
}

export function describeToolCallForHuman(
  call: ToolOnly,
  tz = 'Europe/Paris',
  speechMode: HumanSpeechMode = 'tu',
): string {
  const poss = speechMode === 'vous' ? 'votre' : 'ton';
  const possPlural = speechMode === 'vous' ? 'vos' : 'tes';

  switch (call.name) {
    case 'calendar.create':
      return call.args.endWhen
        ? `créer l'événement "${call.args.title}" de ${formatWhen(call.args.when, tz)} à ${formatWhen(call.args.endWhen, tz)}`
        : `créer l'événement "${call.args.title}" le ${formatWhen(call.args.when, tz)}`;
    case 'calendar.delete':
      if (call.args.query === '__last__') {
        return `supprimer le dernier rendez-vous ciblé`;
      }
      return call.args.ref
        ? `supprimer le rendez-vous #${call.args.ref}`
        : `supprimer le rendez-vous "${call.args.query ?? 'ciblé'}"`;
    case 'calendar.update': {
      const parts: string[] = [
        call.args.ref
          ? `modifier le rendez-vous #${call.args.ref}`
          : call.args.query === '__last__'
            ? `modifier le dernier rendez-vous ciblé`
            : `modifier le rendez-vous "${call.args.query ?? 'ciblé'}"`,
      ];
      if (call.args.title) parts.push(`titre "${call.args.title}"`);
      if (call.args.when) parts.push(`date ${formatWhen(call.args.when, tz)}`);
      if (call.args.endWhen)
        parts.push(`fin ${formatWhen(call.args.endWhen, tz)}`);
      return parts.join(' ');
    }
    case 'calendar.list':
      if (call.args.rangeText) {
        return `afficher ${poss} calendrier (${call.args.rangeText})`;
      }
      if (call.args.startIso && call.args.endIso) {
        return `afficher ${poss} calendrier du ${formatWhen(call.args.startIso, tz)} au ${formatWhen(call.args.endIso, tz)}`;
      }
      return `afficher ${poss} calendrier`;
    case 'calendar.has':
      if (call.args.when) {
        return `vérifier si tu as des rendez-vous (${call.args.when})`;
      }
      if (call.args.startIso && call.args.endIso) {
        return `vérifier si tu as des rendez-vous du ${formatWhen(call.args.startIso, tz)} au ${formatWhen(call.args.endIso, tz)}`;
      }
      return `vérifier si tu as des rendez-vous`;
    case 'calendar.duration':
      if (call.args.query === '__last__') {
        return `donner la durée du dernier rendez-vous ciblé`;
      }
      return call.args.ref
        ? `donner la durée du rendez-vous #${call.args.ref}`
        : `donner la durée du rendez-vous "${call.args.query ?? 'ciblé'}"`;
    case 'todo.add':
      return `ajouter "${call.args.text}" dans ${possPlural} todos`;
    case 'todo.done':
      return `marquer comme fait le todo "${call.args.query}"`;
    case 'todo.reopen':
      return `rouvrir le todo "${call.args.query}"`;
    case 'todo.done_all':
      return `marquer tous les todos comme faits`;
    case 'todo.update':
      return `modifier le todo "${call.args.query}"`;
    case 'todo.delete':
      return `supprimer le todo "${call.args.query}"`;
    case 'todo.bulk_done':
      return `marquer comme faits les todos #${call.args.refs.join(', #')}`;
    case 'todo.bulk_delete':
      return `supprimer les todos #${call.args.refs.join(', #')}`;
    case 'todo.clear_done':
      return `supprimer tous les todos terminés`;
    case 'todo.clear_all':
      return `supprimer tous les todos`;
    case 'todo.list':
      return `afficher ${possPlural} todos`;
    case 'note.add':
      return call.args.title
        ? `ajouter la note "${call.args.title}"`
        : `ajouter une note`;
    case 'note.list':
      return `afficher ${possPlural} notes`;
    case 'note.search':
      return `chercher des notes sur "${call.args.query}"`;
    case 'note.update':
      return `modifier la note "${call.args.query}"`;
    case 'note.delete':
      return `supprimer la note "${call.args.query}"`;
    case 'shopping.add':
      return `ajouter "${call.args.text}" à ${poss} liste de courses`;
    case 'shopping.bought':
      return `marquer "${call.args.query}" comme achete`;
    case 'shopping.unbought':
      return `remettre "${call.args.query}" en non acheté`;
    case 'shopping.bought_all':
      return `marquer tous les articles comme achetés`;
    case 'shopping.update':
      return `modifier l'article "${call.args.query}"`;
    case 'shopping.delete':
      return `supprimer l'article "${call.args.query}"`;
    case 'shopping.bulk_bought':
      return `marquer comme achetés les articles #${call.args.refs.join(', #')}`;
    case 'shopping.bulk_delete':
      return `supprimer les articles #${call.args.refs.join(', #')}`;
    case 'shopping.clear_bought':
      return `supprimer tous les articles déjà achetés`;
    case 'shopping.clear_all':
      return `supprimer tous les articles de la liste de courses`;
    case 'shopping.list':
      return `afficher ${poss} liste de courses`;
    case 'weather.forecast':
      return call.args.location
        ? `donner la meteo (${call.args.day === 'tomorrow' ? 'demain' : "aujourd'hui"}) a ${call.args.location}`
        : `donner la meteo (${call.args.day === 'tomorrow' ? 'demain' : "aujourd'hui"})`;
    case 'web.search':
      return `chercher sur internet "${call.args.query}"`;
    case 'web.open':
      return `ouvrir la page "${call.args.url}"`;
    case 'gmail.list':
      return call.args.category
        ? call.args.unreadOnly
          ? `afficher ${possPlural} emails non lus dans ${getGmailCategoryLabel(call.args.category)}`
          : `afficher ${possPlural} emails dans ${getGmailCategoryLabel(call.args.category)}`
        : call.args.unreadOnly
          ? `afficher ${possPlural} emails non lus`
          : `afficher ${possPlural} emails`;
    case 'gmail.get':
      return call.args.ref
        ? `ouvrir l'email #${call.args.ref}`
        : `ouvrir l'email "${call.args.query ?? 'cible'}"`;
    case 'gmail.summary':
      if (call.args.ref) return `resumer l'email #${call.args.ref}`;
      if (call.args.category || call.args.unreadOnly !== undefined) {
        const base = call.args.category
          ? call.args.unreadOnly === false
            ? `resumer ${possPlural} emails dans ${getGmailCategoryLabel(call.args.category)}`
            : `resumer ${possPlural} emails non lus dans ${getGmailCategoryLabel(call.args.category)}`
          : call.args.unreadOnly === false
            ? `resumer ${possPlural} emails`
            : `resumer ${possPlural} emails non lus`;
        return typeof call.args.limit === 'number' ? `${base} (max ${call.args.limit})` : base;
      }
      return `resumer l'email "${call.args.query ?? 'cible'}"`;
    case 'gmail.send':
      return `envoyer un email a ${call.args.to} (sujet: "${call.args.subject}")`;
    case 'gmail.mark_read':
      return call.args.ref
        ? `marquer l'email #${call.args.ref} comme lu`
        : `marquer l'email "${call.args.query ?? 'cible'}" comme lu`;
    case 'gmail.bulk_mark_read': {
      const count =
        Array.isArray(call.args.refs) && call.args.refs.length
          ? ` (#${call.args.refs.join(', #')})`
          : typeof call.args.limit === 'number'
            ? ` (max ${call.args.limit})`
            : '';
      const scope = call.args.unreadOnly === false ? 'emails' : 'emails non lus';
      return `marquer ${possPlural} ${scope} comme lus${count}`;
    }
    case 'gmail.mark_unread':
      return call.args.ref
        ? `marquer l'email #${call.args.ref} comme non lu`
        : `marquer l'email "${call.args.query ?? 'cible'}" comme non lu`;
    case 'gmail.archive':
      return call.args.ref
        ? `archiver l'email #${call.args.ref}`
        : `archiver l'email "${call.args.query ?? 'cible'}"`;
    case 'gmail.unarchive':
      return call.args.ref
        ? `desarchiver l'email #${call.args.ref}`
        : `desarchiver l'email "${call.args.query ?? 'cible'}"`;
    case 'gmail.trash':
      return call.args.ref
        ? `mettre l'email #${call.args.ref} a la corbeille`
        : `mettre l'email "${call.args.query ?? 'cible'}" a la corbeille`;
    case 'gmail.untrash':
      return call.args.ref
        ? `restaurer l'email #${call.args.ref} depuis la corbeille`
        : `restaurer l'email "${call.args.query ?? 'cible'}" depuis la corbeille`;
    case 'gmail.delete':
      return call.args.ref
        ? `supprimer definitivement l'email #${call.args.ref}`
        : `supprimer definitivement l'email "${call.args.query ?? 'cible'}"`;
    case 'undo.last_action':
      return `annuler la dernière action`;
    case 'action.history':
      return call.args.status === 'pending'
        ? `afficher les actions en attente`
        : `afficher l'historique recent des actions`;
    case 'workflow.list':
      return `afficher les workflows appris`;
    case 'daily.briefing':
      return `te donner ton briefing du jour`;
    case 'mission.list':
      return call.args.status === 'all'
        ? `afficher toutes tes missions`
        : `afficher tes missions actives`;
    case 'mission.close':
      return call.args.ref
        ? `clôturer la mission #${call.args.ref}`
        : `clôturer la mission "${call.args.query ?? 'ciblée'}"`;
    case 'mission.plan':
      return call.args.horizon
        ? `préparer un plan de mission pour "${call.args.objective}" (${call.args.horizon})`
        : `préparer un plan de mission pour "${call.args.objective}"`;
    case 'goal.create':
      return `créer l'objectif "${call.args.title}"`;
    case 'goal.list':
      return `afficher ${poss} objectifs${call.args.status === 'all' ? ' (tous)' : ' actifs'}`;
    case 'goal.decompose':
      return `décomposer l'objectif en ${call.args.subGoals.length} sous-objectif(s)`;
    case 'goal.done':
      return `marquer l'objectif comme terminé`;
    case 'conflict.detect':
      return `analyser les conflits et doublons de la session`;
    case 'dependency.add':
      return `ajouter une dépendance entre deux tâches`;
    case 'dependency.list':
      return `lister les dépendances de la tâche`;
    case 'dependency.order':
      return `calculer l'ordre d'exécution des tâches`;
    case 'resource.allocate':
      return `allouer ${call.args.allocatedHours}h sur "${call.args.resourceName}"`;
    case 'resource.capacity':
      return `afficher la capacité${call.args.resourceType ? ` (${call.args.resourceType})` : ''} des ressources`;
    case 'resource.optimize':
      return `suggérer des optimisations de ressources`;
    case 'analytics.forecast':
      return `sauvegarder les prévisions pour "${call.args.metricType}"`;
    case 'analytics.trend':
      return `analyser la tendance de "${call.args.metricType}"`;
    case 'schedule.suggest':
      return `suggérer un créneau: ${call.args.rationale}`;
    case 'schedule.list':
      return `lister les suggestions de planification`;
    case 'schedule.apply':
      return `appliquer la suggestion de planification`;
    case 'schedule.next_slot':
      return `trouver le prochain créneau libre (${call.args.durationMinutes ?? 60} min)`;
    case 'help.create':
      return `créer une aide contextuelle pour "${call.args.context}"`;
    case 'help.find':
      return `rechercher de l'aide pour "${call.args.context}"`;
    case 'search.query':
      return `rechercher "${call.args.query}"${call.args.types ? ` dans ${call.args.types.join(', ')}` : ''}`;
    case 'knowledge.save':
      return `sauvegarder la connaissance "${call.args.title}"`;
    case 'knowledge.find':
      return `chercher dans la base de connaissances: "${call.args.query}"`;
    case 'knowledge.list':
      return `lister la base de connaissances${call.args.category ? ` (${call.args.category})` : ''}`;
    case 'time.record':
      return `enregistrer la métrique "${call.args.metricName}": ${call.args.value} ${call.args.unit ?? 'minutes'}`;
    case 'time.summary':
      return `résumé des insights temporels (${call.args.period ?? 'semaine'})`;
    case 'delegation.create':
      return `déléguer "${call.args.taskDescription}" à ${call.args.delegateTo}`;
    case 'delegation.list':
      return `lister les délégations${call.args.status ? ` (${call.args.status})` : ''}`;
    case 'delegation.escalate':
      return `escalader la délégation vers ${call.args.escalateTo}`;
    case 'delegation.resolve':
      return `résoudre la délégation`;
    case 'reminder.create':
      return `créer un rappel: "${call.args.text}"`;
    case 'reminder.list':
      return `lister les rappels`;
    case 'reminder.done':
      return `marquer le rappel #${call.args.ref} comme fait`;
    case 'reminder.snooze':
      return `reporter le rappel #${call.args.ref}`;
    case 'reminder.delete':
      return `supprimer le rappel #${call.args.ref}`;
    case 'habit.create':
      return `créer l'habitude "${call.args.name}"`;
    case 'habit.list':
      return `lister les habitudes`;
    case 'habit.log':
      return `enregistrer l'habitude #${call.args.ref} comme faite`;
    case 'habit.streak':
      return `voir les séries d'habitudes`;
    case 'habit.archive':
      return `archiver l'habitude #${call.args.ref}`;
    case 'contact.save':
      return `sauvegarder le contact "${call.args.name}"`;
    case 'contact.find':
      return `chercher le contact "${call.args.query}"`;
    case 'contact.list':
      return `lister les contacts`;
    case 'contact.update':
      return `mettre à jour le contact "${call.args.query}"`;
    case 'contact.delete':
      return `supprimer le contact "${call.args.query}"`;
    case 'expense.add':
      return `ajouter une dépense de ${call.args.amount} ${call.args.currency ?? 'EUR'} — ${call.args.description}`;
    case 'expense.list':
      return `lister les dépenses`;
    case 'expense.summary':
      return `résumé des dépenses (${call.args.period ?? 'mois'})`;
    case 'budget.set':
      return `définir un budget: ${call.args.category} → ${call.args.limit} ${call.args.currency ?? 'EUR'}`;
    case 'budget.status':
      return `voir l'état des budgets`;
    default:
      return `exécuter l'action`;
  }
}

function maybeAddName(profile: HumanProfile, sentence: string) {
  if (!profile.preferredName) return sentence;
  if (profile.verbosity === 'brief') return sentence;
  return `${sentence}${addressSuffix(profile)}`;
}

export function humanizeAskOrFinal(
  profile: HumanProfile,
  text: string,
  kind: 'ask' | 'final',
) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (profile.verbosity === 'brief') return trimmed;

  if (kind === 'ask') {
    const intro =
      profile.speechMode === 'vous'
        ? pick(profile, ['Pour bien faire, ', 'J’ai besoin d’une precision: '])
        : pick(profile, ['Pour bien faire, ', "J'ai besoin d'une precision: "]);
    if (trimmed.endsWith('?')) return `${intro}${trimmed}`;
    return `${intro}${trimmed}${profile.speechMode === 'vous' ? ', d’accord ?' : ', ok ?'}`;
  }

  if (/^(ok|c['’]est fait|fait|bien note)/i.test(trimmed)) return trimmed;
  const intro =
    profile.speechMode === 'vous'
      ? pick(profile, ['Bien note. ', "C'est fait. "])
      : pick(profile, ['Bien note. ', "C'est fait. "]);
  return maybeAddName(profile, `${intro}${trimmed}`);
}

export function humanizePendingPrompt(
  profile: HumanProfile,
  call: ToolOnly,
  tz = 'Europe/Paris',
  plan?: ToolExecutionPlan,
  options?: { preview?: string | null },
) {
  const action =
    plan?.summary ?? describeToolCallForHuman(call, tz, profile.speechMode);
  const caution = pendingConfirmationContext(profile, plan);
  const preview = options?.preview?.trim() || '';
  const parts: string[] = [`${maybeAddName(profile, 'Je peux')} ${action}.`];
  if (preview) parts.push(`Aperçu:\n${preview}`);
  parts.push(
    caution
      ? `${caution} ${confirmQuestion(profile)}`
      : confirmQuestion(profile),
  );
  return parts.join('\n\n');
}

export function humanizePendingReminder(
  profile: HumanProfile,
  call: ToolOnly,
  tz = 'Europe/Paris',
  plan?: ToolExecutionPlan,
  options?: { preview?: string | null },
) {
  const action =
    plan?.summary ?? describeToolCallForHuman(call, tz, profile.speechMode);
  const caution = pendingConfirmationContext(profile, plan);
  const preview = options?.preview?.trim() || '';
  const parts: string[] = [`J'ai une action en attente: ${action}.`];
  if (preview) parts.push(`Aperçu:\n${preview}`);
  parts.push(
    caution
      ? `${caution} ${confirmQuestion(profile)}`
      : confirmQuestion(profile),
  );
  return parts.join('\n\n');
}

export function humanizeCancellation(profile: HumanProfile) {
  if (profile.speechMode === 'vous') return "D'accord, je n'exécute rien.";
  return "Ok, je n'exécute rien.";
}

export function humanizeNoPending(profile: HumanProfile) {
  if (profile.speechMode === 'vous') return "Je n'ai plus d'action en attente.";
  return "Je n'ai plus d'action en attente.";
}

export function humanizeToolResult(
  profile: HumanProfile,
  result: string,
  options?: { fromConfirmation?: boolean },
) {
  const text = result.trim();
  if (!text) return result;

  if (/^Briefing du jour/i.test(text)) {
    if (profile.verbosity === 'brief') return text;
    const intro =
      profile.speechMode === 'vous'
        ? 'Voici votre briefing.'
        : 'Voici ton briefing.';
    return `${intro}\n\n${text}`;
  }

  if (/^Mission plan/i.test(text)) {
    if (profile.verbosity === 'brief') return text;
    const intro =
      profile.speechMode === 'vous'
        ? 'Voici le plan de mission.'
        : 'Voici ton plan de mission.';
    return `${intro}\n\n${text}`;
  }

  if (/^SIMULATION:\s*/i.test(text)) {
    const core = text.replace(/^SIMULATION:\s*/i, '');
    const intro =
      profile.speechMode === 'vous'
        ? 'Simulation active: '
        : 'Mode simulation: ';
    return `${intro}${core}`;
  }

  if (/^OK\.\s*/i.test(text)) {
    const core = text.replace(/^OK\.\s*/i, '');
    if (profile.verbosity === 'brief') return core;

    const prefix = options?.fromConfirmation
      ? pick(profile, ['Parfait, ', "C'est fait, "])
      : pick(profile, ["C'est fait, ", 'Parfait, ']);
    return `${prefix}${core}`;
  }

  if (
    /^(Aucun|Aucune|Liste de courses vide|Numéro invalide|Je n’ai pas|Je n'ai pas)/i.test(
      text,
    )
  ) {
    return text;
  }

  return text;
}

export function humanizeError(profile: HumanProfile) {
  if (profile.speechMode === 'vous') {
    return 'Je rencontre un souci technique. Pouvez-vous reessayer dans quelques secondes ?';
  }
  return 'Je rencontre un souci technique. Tu peux reessayer dans quelques secondes ?';
}

function pendingConfirmationContext(
  profile: HumanProfile,
  plan?: ToolExecutionPlan,
) {
  if (!plan) return '';

  if (plan.confirmationReason === 'intent_medium_confidence') {
    return profile.speechMode === 'vous'
      ? 'Le ciblage me paraît plausible, mais je préfère votre validation avant d’agir.'
      : 'Le ciblage me paraît plausible, mais je préfère ta validation avant d’agir.';
  }

  if (plan.confirmationReason === 'tool_policy' && plan.risk === 'high') {
    return 'C’est une action sensible.';
  }

  return '';
}
