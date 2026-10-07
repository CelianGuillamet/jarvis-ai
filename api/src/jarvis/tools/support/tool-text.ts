import { DateTime } from 'luxon';
import type { CalendarEventItem } from '../../../calendar/providers/calendar.provider';
import { resolveRange } from '../../lib/resolve-range';
import type {
  GmailMessageDetail,
  GmailMessageItem,
} from '../../../gmail/providers/gmail.provider';
import {
  type GmailCategory,
  GMAIL_CATEGORIES,
  GMAIL_CATEGORY_LABELS_FR,
  getGmailCategoryFromLabels,
  getGmailCategoryLabel,
} from '../../../gmail/gmail-category';

export function parseNumberRef(query: string) {
  const m = query.trim().match(/^#(\d{1,3})$/);
  if (!m) return null;
  return Number(m[1]);
}

export function formatDate(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat("ccc dd/LL 'à' HH:mm");
}

export function formatMailDate(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat("ccc dd/LL 'à' HH:mm");
}

export function getMailCategory(
  mail: Pick<GmailMessageItem, 'category' | 'labels'>,
) {
  return mail.category ?? getGmailCategoryFromLabels(mail.labels);
}

export function formatMailCategoryTag(
  mail: Pick<GmailMessageItem, 'category' | 'labels'>,
) {
  const category = getMailCategory(mail);
  return `[${getGmailCategoryLabel(category)}]`;
}

export function summarizeMailCategoryBreakdown(messages: GmailMessageItem[]) {
  const counts = new Map<GmailCategory, number>();
  for (const message of messages) {
    const category = getMailCategory(message);
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const parts = GMAIL_CATEGORIES.filter((category) => counts.has(category)).map(
    (category) =>
      `${GMAIL_CATEGORY_LABELS_FR[category]} ${counts.get(category)}`,
  );

  return parts.length ? `Repartition onglets: ${parts.join(' | ')}` : null;
}

export function normalizeForMatch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

export function parseCalendarOrdinalRef(textNorm: string) {
  const patterns: Array<{ n: number; re: RegExp }> = [
    { n: 1, re: /\b(premier|premiere|1er|1ere)\b/ },
    { n: 2, re: /\b(deuxieme|second|seconde|2e|2eme)\b/ },
    { n: 3, re: /\b(troisieme|3e|3eme)\b/ },
    { n: 4, re: /\b(quatrieme|4e|4eme)\b/ },
    { n: 5, re: /\b(cinquieme|5e|5eme)\b/ },
    { n: 6, re: /\b(sixieme|6e|6eme)\b/ },
    { n: 7, re: /\b(septieme|7e|7eme)\b/ },
    { n: 8, re: /\b(huitieme|8e|8eme)\b/ },
    { n: 9, re: /\b(neuvieme|9e|9eme)\b/ },
    { n: 10, re: /\b(dixieme|10e|10eme)\b/ },
  ];
  for (const { n, re } of patterns) {
    if (re.test(textNorm)) return n;
  }
  return null;
}

export function parseCalendarRefFromQuery(query: string) {
  const raw = query.trim();
  if (!raw) return null;

  const hash = raw.match(/#\s*(\d{1,3})\b/);
  if (hash) return Number(hash[1]);

  const norm = normalizeForMatch(raw);
  const num = norm.match(/\b(?:numero|num|n)\s*(\d{1,3})\b/);
  if (num) return Number(num[1]);

  return parseCalendarOrdinalRef(norm);
}

export function parseGmailRefFromQuery(query: string) {
  return parseCalendarRefFromQuery(query);
}

export function compactText(value: string, max = 260) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function formatCalendarEventPreview(
  event: CalendarEventItem,
  tz: string,
) {
  const start = DateTime.fromJSDate(event.when).setZone(tz);
  const end = DateTime.fromJSDate(event.end ?? event.when).setZone(tz);
  const range =
    event.end && end.isValid && end.toMillis() !== start.toMillis()
      ? `${start.toFormat("ccc dd/LL 'à' HH:mm")} → ${end.toFormat('HH:mm')}`
      : start.toFormat("ccc dd/LL 'à' HH:mm");
  return `${event.title} — ${range}`;
}

export function formatPreviewLines(lines: Array<string | null | undefined>) {
  return lines
    .filter(
      (line): line is string =>
        typeof line === 'string' && line.trim().length > 0,
    )
    .join('\n');
}

export function stripQuotedReplyLines(value: string) {
  return value
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith('>')) return false;
      if (/^le\s.+a ecrit\s*:/i.test(trimmed)) return false;
      if (/^on\s.+wrote\s*:/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

export function summarizeMail(detail: GmailMessageDetail) {
  const body = stripQuotedReplyLines(detail.bodyText || '');
  const preview = compactText(body || detail.snippet || '', 420);
  if (!preview) return 'Contenu court ou vide.';
  return preview;
}

export function formatClock(d: Date, tz: string) {
  return DateTime.fromJSDate(d).setZone(tz).toFormat('HH:mm');
}

export function describeRelativeMoment(target: DateTime, now: DateTime) {
  const diffMinutes = Math.round(target.diff(now, 'minutes').minutes);
  if (Math.abs(diffMinutes) <= 5) return 'maintenant';
  if (diffMinutes < 0) {
    const abs = Math.abs(diffMinutes);
    return abs < 60 ? `depuis ${abs} min` : `depuis ${Math.round(abs / 60)} h`;
  }
  if (diffMinutes < 60) return `dans ${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `dans ${hours} h ${minutes}` : `dans ${hours} h`;
}

export function scoreMailUrgency(mail: GmailMessageItem, now: DateTime) {
  const category = mail.category ?? getGmailCategoryFromLabels(mail.labels);
  const text = normalizeForMatch(
    `${mail.subject} ${mail.from} ${mail.snippet} ${mail.labels.join(' ')}`,
  );
  const weightedKeywords: Array<{ weight: number; words: string[] }> = [
    {
      weight: 3,
      words: [
        'urgent',
        'asap',
        'immediat',
        'alerte',
        'incident',
        'security',
        'securite',
        'verification',
        'mot de passe',
        'password',
      ],
    },
    {
      weight: 2,
      words: [
        'facture',
        'invoice',
        'paiement',
        'payment',
        'echeance',
        'rappel',
        'action requise',
        'action requise',
        'important',
      ],
    },
  ];

  let score = 0;
  for (const group of weightedKeywords) {
    if (group.words.some((word) => text.includes(word))) {
      score += group.weight;
    }
  }

  const ageHours = Math.abs(
    now.diff(DateTime.fromJSDate(mail.date).setZone(now.zone), 'hours').hours,
  );
  if (ageHours <= 24) score += 1;
  if (mail.unread) score += 1;
  if (/\b(?:billing|security|support|admin|noreply|no reply)\b/.test(text)) {
    score += 1;
  }

  if (category === 'primary') score += 2;
  else if (category === 'updates') score += 1;
  else if (category === 'social') score -= 1;
  else if (category === 'promotions') score -= 2;

  return score;
}

export function attentionLabel(score: number) {
  if (score >= 6) return 'CRITIQUE';
  if (score >= 4) return 'ELEVEE';
  if (score >= 2) return 'MODEREE';
  return 'STABLE';
}

export function monthFromFrench(name: string): number | null {
  const n = normalizeForMatch(name);
  const map: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
  };
  return map[n] ?? null;
}

export function extractDayMonthHint(textNorm: string) {
  const numeric = textNorm.match(
    /\b(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?\b/,
  );
  if (numeric) {
    return { day: Number(numeric[1]), month: Number(numeric[2]) };
  }

  const named = textNorm.match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/,
  );
  if (named) {
    const month = monthFromFrench(named[2]);
    if (month) return { day: Number(named[1]), month };
  }

  const dayOnly = textNorm.match(
    /\b(?:le|du|de|au|a)\s+(\d{1,2})(?!\s*(?:h|:))\b/,
  );
  if (dayOnly) {
    return { day: Number(dayOnly[1]), month: null };
  }

  return null;
}

export function extractWeekdayHint(textNorm: string) {
  const map: Record<string, number> = {
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
    dimanche: 7,
  };
  for (const [name, weekday] of Object.entries(map)) {
    if (textNorm.includes(name)) return weekday;
  }
  return null;
}

export function extractTimeHint(textNorm: string) {
  if (textNorm.includes('midi')) return { hour: 12, minute: 0 };
  if (textNorm.includes('minuit')) return { hour: 0, minute: 0 };
  const m = textNorm.match(/\b(\d{1,2})(?:h|:)(\d{1,2})?\b/);
  if (!m) return null;
  return {
    hour: Number(m[1]),
    minute: m[2] ? Number(m[2]) : 0,
  };
}

export const CALENDAR_QUERY_STOPWORDS = new Set<string>([
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
  'un',
  'une',
  'et',
  'a',
  'au',
  'aux',
  'pour',
  'que',
  'qui',
  'ce',
  'quoi',
  'est',
  'j',
  'ai',
  'mes',
  'mon',
  'sur',
  'dans',
  'rendez',
  'vous',
  'rdv',
  'agenda',
  'calendrier',
  'prochain',
  'prochaine',
  'prochains',
  'prochaines',
  'supprime',
  'supprimer',
  'modifie',
  'modifier',
  'deplace',
  'deplacer',
  'durent',
  'duree',
  'combien',
  'temps',
  'premier',
  'deuxieme',
  'troisieme',
  'numero',
  'celui',
  'celle',
  'meme',
  '__last__',
]);

export const CALENDAR_FOCUS_QUERIES = new Set<string>([
  '__last__',
  'dernier',
  'dernier rdv',
  'dernier rendez vous',
  'dernier rendez-vous',
  'le dernier',
  'celui',
  'celle',
  'celui la',
  'celle la',
  'ce rdv',
  'ce rendez vous',
  'ce rendez-vous',
  'le meme',
]);

export function isFocusQuery(queryNorm: string) {
  const compact = queryNorm.replace(/\s+/g, ' ').trim();
  if (!compact) return true;
  if (CALENDAR_FOCUS_QUERIES.has(compact)) return true;
  const tokens = compact
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !CALENDAR_QUERY_STOPWORDS.has(t));
  return tokens.length === 0;
}

export function resolveCalendarInterval(
  input: {
    rangeText?: string;
    when?: string;
    startIso?: string;
    endIso?: string;
  },
  tz: string,
):
  | { error: string; startIso: null; endIso: null }
  | { error: null; startIso: string; endIso: string } {
  const hasIso = !!(input.startIso && input.endIso);
  if (hasIso) {
    const start = DateTime.fromISO(input.startIso!, { zone: tz });
    const end = DateTime.fromISO(input.endIso!, { zone: tz });
    if (!start.isValid || !end.isValid) {
      return {
        error: 'Intervalle ISO invalide (startIso/endIso).',
        startIso: null,
        endIso: null,
      };
    }
    if (end <= start) {
      return {
        error: 'Intervalle invalide: endIso doit être après startIso.',
        startIso: null,
        endIso: null,
      };
    }
    return {
      error: null,
      startIso: start.toISO({ suppressMilliseconds: true }),
      endIso: end.toISO({ suppressMilliseconds: true }),
    };
  }

  const text = input.rangeText ?? input.when;
  if (!text || !text.trim()) {
    return {
      error:
        'Période manquante. Donne-moi une période (ex: "2 semaines") ou startIso/endIso.',
      startIso: null,
      endIso: null,
    };
  }

  const { startIso, endIso } = resolveRange(text, tz);
  return { error: null, startIso, endIso };
}

export function formatDurationMinutes(totalMinutes: number) {
  const minutes = Math.max(1, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function noteLabel(note: { title: string | null; text: string }) {
  if (note.title && note.title.trim()) return note.title;
  const base = note.text.replace(/\s+/g, ' ').trim();
  return base.length > 60 ? `${base.slice(0, 60)}…` : base;
}
