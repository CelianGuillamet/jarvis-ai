const ABBREVIATIONS = new Set([
  "m", "mm", "mme", "mmes", "mlle", "mlles", "me", "mes", "dr", "drs", "pr", "prs", "st", "ste", "sts", "stes",
  "env", "cf", "cie", "ste", "av", "bd", "fr", "tel", "tél", "n", "no", "nos", "p", "pp", "vol", "ex",
  "ch", "hon", "gal", "col", "cdt", "lt", "mgr", "jr", "sr", "vs", "resp", "apr", "avr", "janv", "févr", "juil", "sept", "oct", "nov", "déc",
]);
const MAX_INPUT = 20_000;

/** Reading text, not markup: drop code, links, headings and list markers. */
export function plainSpeechText(markdown: string): string {
  return markdown
    .slice(0, MAX_INPUT)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function endsSentence(text: string, at: number): boolean {
  const mark = text[at];
  if (mark !== "." && mark !== "!" && mark !== "?" && mark !== "…") return false;
  while (text[at + 1] === "." || text[at + 1] === "!" || text[at + 1] === "?" || text[at + 1] === "…") at++;
  const next = text[at + 1];
  if (next !== undefined && !/\s/.test(next)) return false;
  if (mark === ".") {
    let start = at;
    while (start > 0 && /[\p{L}]/u.test(text[start - 1] ?? "")) start--;
    const word = text.slice(start, at).toLowerCase();
    if (ABBREVIATIONS.has(word) && word.length <= 5) return false;
    if (/^[\p{Lu}]$/u.test(text.slice(start, at))) return false;
    if (/\d$/.test(text.slice(0, at)) && /^\s*\d/.test(text.slice(at + 1))) return false;
  }
  const after = text.slice(at + 1).trimStart();
  return after === "" || /^[\p{Lu}\d«"“(¿¡]/u.test(after);
}

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!endsSentence(text, i)) continue;
    let end = i;
    while (/[.!?…]/.test(text[end + 1] ?? "")) end++;
    const sentence = text.slice(start, end + 1).trim();
    if (sentence) out.push(sentence);
    start = end + 1;
    i = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

function splitLong(sentence: string, max: number): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(", ", max);
    if (cut < max / 3) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Speech chunks for incremental playback: the first sentence alone (fast start), then
 * following sentences grouped up to `max` characters. Iterative and bounded.
 */
export function chunkForSpeech(markdown: string, max = 300, maxChunks = 40): string[] {
  const sentences = splitSentences(plainSpeechText(markdown)).flatMap(sentence => splitLong(sentence, max));
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!chunks.length && !current) {
      chunks.push(sentence);
      continue;
    }
    if (current && current.length + 1 + sentence.length > max) {
      chunks.push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
    if (chunks.length >= maxChunks) break;
  }
  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks;
}
