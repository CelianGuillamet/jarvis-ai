import type { HumanProfile } from './humanize';

const DAY_NAMES: Record<string, string> = {
  'lun.': 'Lundi',
  'mar.': 'Mardi',
  'mer.': 'Mercredi',
  'jeu.': 'Jeudi',
  'ven.': 'Vendredi',
  'sam.': 'Samedi',
  'dim.': 'Dimanche',
};

/** « Monsieur » for formal address unless a name is known; nothing in informal mode. */
export function addressee(profile: HumanProfile): string {
  if (profile.preferredName) return profile.preferredName;
  return profile.speechMode === 'vous' ? 'Monsieur' : '';
}

const withAddress = (sentence: string, profile: HumanProfile) => {
  const who = addressee(profile);
  return who && profile.verbosity !== 'brief'
    ? `${sentence}, ${who}`
    : sentence;
};

const possessive = (profile: HumanProfile, feminine = false) =>
  profile.speechMode === 'vous'
    ? feminine
      ? 'votre'
      : 'votre'
    : feminine
      ? 'ta'
      : 'ton';
const plural = (profile: HumanProfile) =>
  profile.speechMode === 'vous' ? 'vos' : 'tes';

function agenda(lines: string[], profile: HumanProfile): string {
  const days: { key: string; label: string; items: string[] }[] = [];
  let unmatched = false;
  for (const line of lines) {
    const match = /^#(\d+) - (\S+) (\d{2}\/\d{2}) à (\d{2}:\d{2}) — (.+)$/.exec(
      line,
    );
    if (!match) {
      unmatched = true;
      break;
    }
    const [, ref, day, date, time, title] = match;
    const key = `${day} ${date}`;
    let group = days.find((d) => d.key === key);
    if (!group) {
      group = {
        key,
        label: `${DAY_NAMES[day ?? ''] ?? day} ${date}`,
        items: [],
      };
      days.push(group);
    }
    group.items.push(`- **${time}** — ${title} (#${ref})`);
  }
  if (unmatched || !days.length) return lines.join('\n');
  const count = lines.length;
  const intro =
    count === 1
      ? `${withAddress('Un seul rendez-vous à signaler', profile)}.`
      : `${withAddress(`Voici ${possessive(profile)} agenda`, profile)} : ${count} rendez-vous.`;
  const body = days
    .map((d) => `**${d.label}**\n${d.items.join('\n')}`)
    .join('\n\n');
  const close =
    profile.verbosity === 'brief'
      ? ''
      : `\n\n${profile.speechMode === 'vous' ? 'Souhaitez-vous que je prépare ou déplace l’un d’eux ?' : 'Tu veux que je prépare ou déplace l’un d’eux ?'}`;
  return `${intro}\n\n${body}${close}`;
}

function checklist(
  lines: string[],
  profile: HumanProfile,
  kind: 'tâches' | 'courses' | 'notes',
): string {
  const items: string[] = [];
  for (const line of lines) {
    const match = /^[-•]?\s*#(\d+) - (.+)$/.exec(line);
    if (!match) return lines.join('\n');
    items.push(`- **#${match[1]}** ${match[2]}`);
  }
  if (!items.length) return lines.join('\n');
  const label =
    kind === 'tâches'
      ? `${plural(profile)} tâches en cours`
      : kind === 'courses'
        ? `${possessive(profile, true)} liste de courses`
        : `${plural(profile)} notes`;
  const intro = `${withAddress(`Voici ${label}`, profile)} :`;
  return `${intro}\n\n${items.join('\n')}`;
}

function mails(lines: string[], profile: HumanProfile): string {
  const out: string[] = [];
  let current = false;
  for (const line of lines) {
    if (/^#\d+ - /.test(line)) {
      out.push(`- ${line.replace(/^#(\d+) - /, '**#$1** ')}`);
      current = true;
    } else if (current && /^Extrait:/.test(line)) {
      out.push(`  > ${line.replace(/^Extrait:\s*/, '')}`);
    } else return lines.join('\n');
  }
  void profile;
  return out.join('\n');
}

/** Lay out list-style tool output as short Markdown with a spoken-style lead-in. */
export function formatListReply(text: string, profile: HumanProfile): string {
  const [head = '', ...rest] = text.split('\n');
  const body = rest.filter((line) => line.trim() !== '');
  const unchanged = (out: string) => (out === body.join('\n') ? text : out);
  if (/^Rendez-vous:$/i.test(head.trim()))
    return unchanged(agenda(body, profile));
  if (/^Todos \((open|all)\):$/i.test(head.trim()))
    return unchanged(checklist(body, profile, 'tâches'));
  if (/^Courses \((open|all)\):$/i.test(head.trim()))
    return unchanged(checklist(body, profile, 'courses'));
  if (/^Notes \(\d+\):$/i.test(head.trim()))
    return unchanged(checklist(body, profile, 'notes'));
  if (
    /^(Emails|Email)[^\n]*\(\d+\):$/i.test(head.trim()) ||
    (/\(\d+\):$/.test(head.trim()) && body.some((l) => /^#\d+ - \[/.test(l)))
  ) {
    const list = mails(body, profile);
    return list === body.join('\n')
      ? text
      : `${withAddress('Voici ce que j’ai trouvé', profile)} — ${head.trim().replace(/:$/, '')} :\n\n${list}`;
  }
  return text;
}

const EMPTY: [RegExp, (p: HumanProfile) => string][] = [
  [
    /^Aucun todo\.?$/i,
    (p) => `${withAddress('Aucune tâche en cours', p)}. Tout est à jour.`,
  ],
  [
    /^Aucun événement sur cette période\.?$/i,
    (p) => `${withAddress('Votre agenda est libre sur cette période', p)}.`,
  ],
  [
    /^Liste de courses vide\.?$/i,
    (p) => `${withAddress('La liste de courses est vide', p)}.`,
  ],
  [
    /^Aucun email non lu\.?$/i,
    (p) => `${withAddress('Aucun message non lu', p)}. Votre boîte est à jour.`,
  ],
];

export function formatEmptyReply(text: string, profile: HumanProfile): string {
  const trimmed = text.trim();
  for (const [pattern, build] of EMPTY)
    if (pattern.test(trimmed)) {
      const sentence = build(profile);
      return profile.speechMode === 'vous'
        ? sentence
        : sentence.replace(/votre/g, 'ton').replace(/Votre/g, 'Ton');
    }
  return text;
}
