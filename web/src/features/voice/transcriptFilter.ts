const KNOWN_HALLUCINATIONS = [
  "sous-titres réalisés par la communauté d'amara.org",
  "sous-titrage st' 501",
  "sous-titrage société radio-canada",
  "merci d'avoir regardé cette vidéo",
  "merci d'avoir regardé",
  "merci à tous et à la prochaine",
  "n'oubliez pas de vous abonner",
  "abonnez-vous",
  "à bientôt",
];

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[«»"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…\s]+$/g, "");

/**
 * Whisper invents stock phrases on silence or noise. A hands-free loop must never send those
 * to the assistant, so anything that is empty, too short or a known invention is dropped.
 */
export function isNoiseTranscript(text: string): boolean {
  const value = clean(text);
  if (value.length < 2) return true;
  if (!/[\p{L}\p{N}]/u.test(value)) return true;
  return KNOWN_HALLUCINATIONS.some(phrase => {
    const known = clean(phrase);
    return known.length > 0 && (value === known || value.startsWith(`${known} `));
  });
}
