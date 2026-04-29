import type { GmailMessageItem } from '../../gmail/providers/gmail.provider';
import { getGmailCategoryPriority } from '../../gmail/gmail-category';
import type { InboxZeroActionType, InboxZeroCategory } from '../inbox-zero.types';

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}%@._-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((p) => text.includes(p));
}

function firstIncluded(text: string, patterns: string[]) {
  return patterns.find((p) => text.includes(p)) ?? null;
}

function hasPercentDiscount(text: string) {
  return /\b\d{1,3}%\b/.test(text);
}

export type InboxZeroClassification = {
  category: InboxZeroCategory;
  priority: number;
  reason: string;
  suggested: { action: InboxZeroActionType; label: string } | null;
};

export function classifyInboxMessage(message: GmailMessageItem): InboxZeroClassification {
  const subject = message.subject || '';
  const from = message.from || '';
  const snippet = message.snippet || '';
  const text = normalizeText(`${subject} ${from} ${snippet}`);

  const categoryPriority = getGmailCategoryPriority(message.category);
  const hasNoReply = includesAny(text, ['no-reply', 'noreply', 'do-not-reply']);

  const newsletterKeywords = [
    'newsletter',
    'promo',
    'promotion',
    'soldes',
    'deal',
    'offre',
    'marketing',
    'blackfriday',
    'black-friday',
    'cyber',
    'bundle',
    'coupon',
    'code promo',
    'codepromo',
    'reduction',
    'reduc',
    'unsubscribe',
    'desinscription',
    'desinscrire',
  ];

  const scheduleKeywords = [
    'rdv',
    'rendez vous',
    'rendez-vous',
    'meeting',
    'call',
    'visio',
    'zoom',
    'teams',
    'google meet',
    'meet.google.com',
    'calendly',
    'doodle',
    'creneau',
    'créneau',
    'disponibilite',
    'disponibilites',
    'agenda',
    'invitation',
    'planifier',
    'planning',
  ];

  const urgentKeywords = [
    'urgent',
    'asap',
    'aujourd',
    'today',
    'deadline',
    'echeance',
    'echeances',
    'dernier rappel',
    'rappel',
    'relance',
    'incident',
    'bloque',
    'bloquee',
    'bloquees',
    'bloque',
    'bloquant',
    'action requise',
    'action requise',
    'immediat',
    'immediatement',
  ];

  const ignoreKeywords = [
    'notification',
    'notif',
    'automatique',
    'alerte',
    'alert',
    'digest',
    'resume',
    'summary',
    'facture disponible',
    'recu',
    'reçu',
  ];

  const isPromotions = message.category === 'promotions';
  const isSocialOrForums = message.category === 'social' || message.category === 'forums';
  const isUpdates = message.category === 'updates';

  const newsletterHit =
    isPromotions ||
    hasPercentDiscount(text) ||
    includesAny(text, newsletterKeywords) ||
    includesAny(text, ['list-unsubscribe', 'mailchi', 'sendinblue', 'brevo', 'klaviyo']);

  if (newsletterHit) {
    const hit = firstIncluded(text, newsletterKeywords);
    const priority = 20 + categoryPriority * 2;
    return {
      category: 'newsletters',
      priority,
      reason: hit
        ? `Newsletter/promo détectée (mot-clé: "${hit}").`
        : isPromotions
          ? "Onglet Gmail Promotions."
          : 'Newsletter/promo détectée.',
      suggested: { action: 'mark_read_archive', label: 'Nettoyer (lu + archiver)' },
    };
  }

  const scheduleHit = firstIncluded(text, scheduleKeywords);
  if (scheduleHit) {
    const priority = 70 + categoryPriority * 3;
    return {
      category: 'schedule',
      priority,
      reason: `Planification détectée (mot-clé: "${scheduleHit}").`,
      suggested: { action: 'remind', label: 'Planifier (rappel + archiver)' },
    };
  }

  const urgentHit = firstIncluded(text, urgentKeywords);
  if (urgentHit) {
    const priority = 90 + categoryPriority * 3;
    return {
      category: 'urgent',
      priority,
      reason: `Urgence détectée (mot-clé: "${urgentHit}").`,
      suggested: { action: 'draft_reply', label: 'Répondre (draft)' },
    };
  }

  if (isSocialOrForums) {
    const priority = 12 + categoryPriority;
    return {
      category: 'ignore',
      priority,
      reason: 'Onglet Gmail Social/Forums.',
      suggested: { action: 'mark_read_archive', label: 'Nettoyer (lu + archiver)' },
    };
  }

  const ignoreHit =
    (hasNoReply && (isUpdates || includesAny(text, ignoreKeywords))) ||
    includesAny(text, ['github.com', 'gitlab', 'ci', 'build', 'deploy']) ||
    includesAny(text, ignoreKeywords);
  if (ignoreHit) {
    const priority = 18 + categoryPriority * 2;
    const hit = firstIncluded(text, ignoreKeywords);
    return {
      category: 'ignore',
      priority,
      reason: hit ? `Notification détectée (mot-clé: "${hit}").` : 'Notification détectée.',
      suggested: { action: 'mark_read_archive', label: 'Nettoyer (lu + archiver)' },
    };
  }

  const priority = 50 + categoryPriority * 4;
  return {
    category: 'quick_wins',
    priority,
    reason: 'Traitement rapide recommandé.',
    suggested: { action: 'mark_read_archive', label: 'Archiver + lu' },
  };
}

