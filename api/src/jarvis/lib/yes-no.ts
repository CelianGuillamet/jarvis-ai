const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const POLITE = [
  'merci',
  'svp',
  'stp',
  's',
  'il',
  'te',
  'vous',
  'plait',
  'bien',
  'sur',
  'parfait',
  'alors',
];
const YES_CORE = [
  'oui',
  'ok',
  'okay',
  'daccord',
  'd',
  'accord',
  'go',
  'yes',
  'yep',
  'confirme',
  'confirm',
  'valide',
  'approuve',
  'approve',
  'execute',
  'lance',
  'vas',
  'y',
  'je',
];
const NO_CORE = [
  'non',
  'no',
  'annule',
  'cancel',
  'stop',
  'laisse',
  'tomber',
  'ne',
  'fais',
  'pas',
  'maintenant',
  'confirme',
  'valide',
  'je',
  'jamais',
  'ca',
  'cela',
];
const MAX_WORDS = 6;

/**
 * A confirmation must be the whole utterance: a short affirmation or refusal and nothing else.
 * Anything that merely mentions « oui » or « confirme » is a question or a statement, never consent.
 */
export function parseYesNo(text: string): 'yes' | 'no' | null {
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length || words.length > MAX_WORDS) return null;
  const refusal =
    words.some((w) =>
      ['non', 'no', 'annule', 'cancel', 'stop', 'jamais'].includes(w),
    ) ||
    (words.includes('ne') && words.includes('pas')) ||
    (words.includes('laisse') && words.includes('tomber')) ||
    (words.includes('pas') && words.includes('maintenant'));
  if (refusal)
    return words.every((w) => NO_CORE.includes(w) || POLITE.includes(w))
      ? 'no'
      : null;
  const core = words.some(
    (w) =>
      [
        'oui',
        'ok',
        'okay',
        'daccord',
        'accord',
        'go',
        'yes',
        'yep',
        'confirme',
        'confirm',
        'valide',
        'approuve',
        'approve',
        'execute',
        'lance',
      ].includes(w) ||
      (w === 'vas' && words.includes('y')),
  );
  if (!core) return null;
  return words.every((w) => YES_CORE.includes(w) || POLITE.includes(w))
    ? 'yes'
    : null;
}
