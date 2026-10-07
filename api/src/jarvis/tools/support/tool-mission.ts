import { DateTime } from 'luxon';
import { normalizeForMatch } from './tool-text';

export const MISSION_STOPWORDS = new Set<string>([
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'ou',
  'pour',
  'sur',
  'dans',
  'avec',
  'sans',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'votre',
  'vos',
  'notre',
  'nos',
  'ce',
  'cet',
  'cette',
  'ces',
  'au',
  'aux',
  'par',
  'd',
  'l',
  'me',
  'moi',
  'toi',
  'faire',
  'fais',
  'preparer',
  'prepare',
  'construire',
  'construis',
  'plan',
  'mission',
  'strategie',
  'roadmap',
  'objectif',
  'action',
]);

export const MISSION_FOCUS_QUERIES = new Set<string>([
  'mission',
  'la mission',
  'ma mission',
  'cette mission',
  'celle ci',
  'celle la',
  'mission en cours',
  'mission active',
  'mission actuelle',
  'mission ouverte',
]);

export function tokenizeMissionText(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !MISSION_STOPWORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}

export function uniqueTokens(tokens: string[]) {
  return [...new Set(tokens)];
}

export function computeMissionMatchScore(
  haystack: string,
  objectiveTokens: string[],
) {
  if (!objectiveTokens.length) return 0;
  const normalized = normalizeForMatch(haystack);
  let score = 0;
  for (const token of objectiveTokens) {
    if (!normalized.includes(token)) continue;
    score += token.length >= 7 ? 3 : token.length >= 5 ? 2 : 1;
  }
  return score;
}

export function isMissionFocusQuery(query: string) {
  const normalized = normalizeForMatch(query);
  if (!normalized) return true;
  if (MISSION_FOCUS_QUERIES.has(normalized)) return true;
  const tokens = tokenizeMissionText(normalized);
  return tokens.length === 0;
}

export function missionComplexityLabel(score: number) {
  if (score >= 8) return 'ELEVEE';
  if (score >= 5) return 'SOUTENUE';
  if (score >= 3) return 'MODEREE';
  return 'CONTENUE';
}

export function formatMissionWindow(
  startIso: string,
  endIso: string,
  tz: string,
) {
  const start = DateTime.fromISO(startIso, { zone: tz });
  const end = DateTime.fromISO(endIso, { zone: tz });
  if (!start.isValid || !end.isValid) return `${startIso} -> ${endIso}`;
  return `${start.toFormat('ccc d LLL HH:mm')} -> ${end.toFormat('ccc d LLL HH:mm')}`;
}
