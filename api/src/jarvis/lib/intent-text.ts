import type { GmailMessageItem } from '../../gmail/providers/gmail.provider';
import { getGmailCategoryPriority } from '../../gmail/gmail-category';

export function normalizeIntentText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

export function extractRefsFromText(value: string) {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const m of value.matchAll(/\b#?(\d{1,3})\b/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 999) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function extractOrdinalRefFromText(value: string) {
  const patterns: Array<{ n: number; re: RegExp }> = [
    { n: 1, re: /\b(premier|premiere|1er|1ere|1e)\b/ },
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
    if (re.test(value)) return n;
  }
  return null;
}

export function includesAny(text: string, patterns: string[]) {
  return patterns.some((p) => text.includes(p));
}

export function hasMetVerb(text: string) {
  return /\bmet(s)?\b/.test(text);
}

export function extractWeatherLocation(text: string) {
  const m = text.match(/\b(?:a|sur|pour)\s+([a-z][a-z -]{1,60})/);
  if (!m) return '';
  let raw = (m[1] || '').trim();
  raw = raw.replace(/[.,;!?].*$/, '').trim();

  const stopPhrases = [
    'aujourd hui',
    'demain',
    'today',
    'tomorrow',
    'semaine',
    'mois',
    'prochain',
    'prochaine',
  ];
  for (const stop of stopPhrases) {
    const idx = raw.indexOf(` ${stop}`);
    if (idx > 0) {
      raw = raw.slice(0, idx).trim();
    }
  }
  if (!raw || stopPhrases.includes(raw)) return '';
  return raw;
}

export function pickFocusUnreadEmail(messages: GmailMessageItem[]) {
  return (
    [...messages].sort((a, b) => {
      const categoryDelta =
        getGmailCategoryPriority(b.category) -
        getGmailCategoryPriority(a.category);
      if (categoryDelta !== 0) return categoryDelta;
      return b.date.getTime() - a.date.getTime();
    })[0] ?? null
  );
}

export function extractMissionObjectiveFromText(userText: string) {
  let out = userText
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
  const patterns = [
    /^(?:jarvis[,:\s-]*)?(?:prepare|prépare|fais|construis|donne|genere|génère|elabore|élabore)\s+(?:moi\s+)?(?:un\s+)?(?:plan de mission|plan d['’]action|plan|roadmap|strategie|stratégie)\s+(?:pour|sur|autour de)\s+/i,
    /^(?:comment\s+(?:tu|on)\s+(?:t['’]y|s['’]y)\s+prend(?:rais|rait|re)?\s+pour)\s+/i,
    /^(?:aide[- ]moi\s+a\s+)?(?:structurer|organiser|clarifier)\s+(?:ma\s+|mon\s+)?(?:mission|strategie|stratégie|roadmap|plan)\s+(?:pour\s+)?/i,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, '').trim();
  }
  return out || userText.trim();
}

export function extractMissionCloseTargetFromText(userText: string) {
  const cleaned = userText
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
  let out = cleaned;
  const patterns = [
    /^(?:jarvis[,:\s-]*)?(?:cloture|clôture|clore|close|ferme|termine|terminer|acheve|achève)\s+(?:moi\s+)?(?:la\s+|ma\s+|cette\s+)?mission\s+/i,
    /^(?:jarvis[,:\s-]*)?(?:marque|passe)\s+(?:la\s+|ma\s+|cette\s+)?mission\s+/i,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, '').trim();
  }
  out = out
    .replace(
      /\s+comme\s+(?:terminee|terminée|faite|close|cloturee|clôturée)$/i,
      '',
    )
    .replace(/^(?:de|du|des|d['’])\s+/i, '')
    .trim();

  if (out) return out;

  const generic = cleaned.match(
    /\b(cette mission|la mission|ma mission|mission en cours|mission active)\b/i,
  );
  return generic?.[1] ?? cleaned;
}
