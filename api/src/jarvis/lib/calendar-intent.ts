import { fr } from 'chrono-node';
import type { ToolOnly } from '../tools/tool-registry';
import { resolveWhenWindow } from './resolve-when';

type CalendarWriteDecision = {
  action: Extract<ToolOnly, { name: 'calendar.create' | 'calendar.delete' }>;
  planner: 'intent';
  confidence: 'high' | 'medium';
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Recognize single, explicit calendar writes; leave complex requests to clarification/model routing. */
export function planCalendarWrite(
  text: string,
  timezone: string,
): CalendarWriteDecision | null {
  const command = text
    .trim()
    .match(
      /^(ajoute|ajouter|crée|cree|créer|creer|planifie|planifier|supprime|supprimer|efface|effacer|annule|annuler)\s+(.+)$/iu,
    );
  if (!command) return null;
  const verb = normalize(command[1]);
  const body = command[2].trim();
  const normalizedBody = normalize(body);
  // The target must be a calendar item, not an email/task mentioning a meeting.
  if (
    !/^(?:(?:un|une|le|la|mon|ma|ce|cette)\s+)?(?:rendez[- ]vous|rdv|reunion|evenement)\b/.test(
      normalizedBody,
    )
  )
    return null;
  if (
    /\b(?:pas|jamais|sauf|mais|ou|todo|todos|tache|taches|mail|email|note|courses)\b/.test(
      normalizedBody,
    )
  )
    return null;
  if (
    /\b(?:et|puis)\s+(?:ajoute|cree|planifie|supprime|efface|annule)\b/.test(
      normalizedBody,
    )
  )
    return null;

  if (/^(supprime|supprimer|efface|effacer|annule|annuler)$/.test(verb)) {
    const reference = normalizedBody.match(
      /^(?:(?:un|une|le|la|mon|ma|ce|cette)\s+)?(?:rendez[- ]vous|rdv|reunion|evenement)\s+#\s*(\d{1,3})[.!?]?$/u,
    );
    // Never drop a second reference, date constraint or malformed identifier.
    if (body.includes('#') && !reference) return null;
    const ref = reference ? Number(reference[1]) : undefined;
    if (ref !== undefined && (ref < 1 || ref > 200)) return null;
    return {
      action: {
        type: 'tool',
        name: 'calendar.delete',
        args: ref === undefined ? { query: body } : { ref },
      },
      planner: 'intent',
      // A natural-language description has not resolved a unique event yet.
      confidence: ref === undefined ? 'medium' : 'high',
    };
  }

  const window = resolveWhenWindow(body, timezone);
  if (!window.hasExplicitDate || !window.hasExplicitTime) return null;
  const dates = fr.parse(body);
  if (dates.length !== 1) return null;
  const date = dates[0];
  const title =
    `${body.slice(0, date.index)} ${body.slice(date.index + date.text.length)}`
      .replace(/^(?:un|une|le|la|mon|ma|ce|cette)\s+/iu, '')
      .replace(/\s+(?:pour|le|à|a)\s*$/iu, '')
      .replace(/\s+/g, ' ')
      .trim();
  if (!title) return null;
  return {
    action: {
      type: 'tool',
      name: 'calendar.create',
      args: {
        title,
        when: window.startIso,
        ...(window.endIso ? { endWhen: window.endIso } : {}),
      },
    },
    planner: 'intent',
    confidence: 'high',
  };
}
