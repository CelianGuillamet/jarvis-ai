import {
  getLastMissionList,
  setLastMissionList,
  patchMissionInCache,
} from '../support/tool-caches';
import {
  compactText,
  formatDate,
  formatClock,
  describeRelativeMoment,
  scoreMailUrgency,
  noteLabel,
} from '../support/tool-text';
import { asGoogleIntegrationError } from '../../../google/google-integration.error';
import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { DateTime } from 'luxon';
import { resolveRange } from '../../lib/resolve-range';
import type { GmailMessageItem } from '../../../gmail/providers/gmail.provider';
import {
  tokenizeMissionText,
  uniqueTokens,
  computeMissionMatchScore,
  missionComplexityLabel,
  formatMissionWindow,
} from '../support/tool-mission';
import { defineTool } from '../define-tool';

export const missionTools = [
  defineTool({
    name: 'mission.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const status = call.args.status ?? 'active';
      const limit = Math.min(Math.max(call.args.limit ?? 5, 1), 12);
      const missions = await prisma.jarvisMission.findMany({
        where: {
          sessionId,
          ...(status === 'all' ? {} : { status: 'active' }),
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          objective: true,
          horizon: true,
          status: true,
          summary: true,
          nextStep: true,
          updatedAt: true,
        },
      });

      if (!missions.length) {
        return status === 'all'
          ? 'Aucune mission enregistrée.'
          : 'Aucune mission active.';
      }

      setLastMissionList(sessionId, missions);
      return `Missions (${status}):\n${missions
        .map((mission, index) => {
          const horizon = mission.horizon ? ` (${mission.horizon})` : '';
          const detail = mission.nextStep || mission.summary;
          return `- #${index + 1} - ${mission.objective}${horizon}${detail ? ` — ${compactText(detail, 120)}` : ''}`;
        })
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'mission.close',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, sessionId } = env;
      const { resolveMissionTarget } = env.resolvers;
      const { target, error } = await resolveMissionTarget(call.args);
      if (!target)
        throw new CommandRejectedError(
          error ?? 'Mission introuvable.',
          error ? 'VALIDATION' : 'NOT_FOUND',
        );
      if (target.status !== 'active') {
        throw new CommandRejectedError(
          `La mission "${target.objective}" n’est plus active.`,
        );
      }

      if (ctx.simulation) {
        return `SIMULATION: mission clôturée "${target.objective}".`;
      }

      await prisma.jarvisMission.update({
        where: { id: target.id },
        data: { status: 'done' },
      });
      patchMissionInCache(sessionId, target.id, {
        status: 'done',
        updatedAt: new Date(),
      });

      return `OK. Mission clôturée: "${target.objective}"${target.nextStep ? ` — dernière prochaine étape: ${compactText(target.nextStep, 120)}` : ''}`;
    },
    preview: (env, call) => {
      const { sessionId } = env;
      const ref =
        typeof call.args.ref === 'number' && Number.isInteger(call.args.ref)
          ? call.args.ref
          : null;
      if (ref === null) return null;
      const list = getLastMissionList(sessionId);
      const item = list[ref - 1];
      if (!item) return null;
      return `Mission #${ref}: ${compactText(item.objective, 160)}`;
    },
  }),
  defineTool({
    name: 'mission.plan',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, prisma, tz, sessionId } = env;
      const objective = call.args.objective.trim();
      if (!objective) throw new CommandRejectedError('Objectif mission vide.');

      const now = DateTime.now().setZone(tz);
      let startIso =
        now.startOf('day').toISO({ suppressMilliseconds: true }) ?? '';
      let endIso =
        now.plus({ days: 2 }).endOf('day').toISO({
          suppressMilliseconds: true,
        }) ?? '';
      let horizonLabel = "aujourd'hui + 48h";

      if (call.args.horizon?.trim()) {
        try {
          const resolved = resolveRange(call.args.horizon, tz);
          startIso = resolved.startIso;
          endIso = resolved.endIso;
          horizonLabel = call.args.horizon.trim();
        } catch {
          horizonLabel = `${call.args.horizon.trim()} (interprétation partielle)`;
        }
      }

      const objectiveTokens = uniqueTokens(
        tokenizeMissionText(objective),
      ).slice(0, 8);
      const keywordPhrase = objectiveTokens.slice(0, 3).join(' ');

      const [todos, notes, shopping, events] = await Promise.all([
        prisma.todo.findMany({
          where: { done: false },
          orderBy: { createdAt: 'asc' },
          take: 16,
          select: { text: true, createdAt: true },
        }),
        prisma.note.findMany({
          orderBy: { createdAt: 'desc' },
          take: 16,
          select: { title: true, text: true, createdAt: true },
        }),
        prisma.shoppingItem.findMany({
          where: { bought: false },
          orderBy: { createdAt: 'asc' },
          take: 10,
          select: { text: true },
        }),
        ctx.calendar.listEventsInterval(sessionId, startIso, endIso, tz, 12),
      ]);

      let unreadMails: GmailMessageItem[] | null = null;
      try {
        unreadMails = await ctx.gmail.listMessages(sessionId, {
          q: 'is:unread',
          maxResults: 8,
        });
      } catch (error) {
        const code = asGoogleIntegrationError(error)?.code;
        if (code !== 'GMAIL_NOT_CONNECTED' && code !== 'GOOGLE_NOT_CONNECTED')
          throw error;
        unreadMails = null;
      }

      const matchedTodos = todos
        .map((todo) => ({
          ...todo,
          score: computeMissionMatchScore(todo.text, objectiveTokens),
        }))
        .filter((todo) => todo.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .slice(0, 3);

      const matchedNotes = notes
        .map((note) => ({
          ...note,
          score: computeMissionMatchScore(
            `${note.title ?? ''} ${note.text}`,
            objectiveTokens,
          ),
        }))
        .filter((note) => note.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .slice(0, 3);

      const matchedEvents = events
        .map((event) => ({
          ...event,
          score: computeMissionMatchScore(event.title, objectiveTokens),
        }))
        .filter((event) => event.score > 0)
        .sort(
          (a, b) => b.score - a.score || a.when.getTime() - b.when.getTime(),
        )
        .slice(0, 3);

      const scoredUnread =
        unreadMails?.map((mail) => ({
          ...mail,
          relevanceScore: computeMissionMatchScore(
            `${mail.subject} ${mail.from} ${mail.snippet}`,
            objectiveTokens,
          ),
          urgencyScore: scoreMailUrgency(mail, now),
        })) ?? [];
      const matchedMails = [...scoredUnread]
        .filter((mail) => mail.relevanceScore > 0 || mail.urgencyScore >= 4)
        .sort((a, b) => {
          const aScore = a.relevanceScore * 2 + a.urgencyScore;
          const bScore = b.relevanceScore * 2 + b.urgencyScore;
          return bScore - aScore || b.date.getTime() - a.date.getTime();
        })
        .slice(0, 3);

      const sortedEvents = [...events].sort(
        (a, b) => a.when.getTime() - b.when.getTime(),
      );
      const nextEvent =
        sortedEvents.find((event) => {
          const end = DateTime.fromJSDate(event.end ?? event.when).setZone(tz);
          return end >= now;
        }) ?? null;

      let complexityScore = 1;
      if (objectiveTokens.length >= 4) complexityScore += 2;
      else if (objectiveTokens.length >= 2) complexityScore += 1;
      if (matchedMails.length) complexityScore += 2;
      if (matchedEvents.length || nextEvent) complexityScore += 2;
      if (matchedTodos.length) complexityScore += 1;
      if (matchedNotes.length) complexityScore += 1;
      if (todos.length >= 6) complexityScore += 1;
      if (shopping.length >= 6) complexityScore += 1;

      const executiveLines: string[] = [];
      if (
        matchedTodos.length ||
        matchedNotes.length ||
        matchedMails.length ||
        matchedEvents.length
      ) {
        executiveLines.push(
          `- J'ai trouvé ${matchedTodos.length + matchedNotes.length + matchedMails.length + matchedEvents.length} signal(s) déjà liés à cet objectif dans ton contexte.`,
        );
      } else {
        executiveLines.push(
          `- Très peu de contexte déjà structuré pour cet objectif: il faut d'abord cadrer le terrain.`,
        );
      }

      if (nextEvent) {
        const nextStart = DateTime.fromJSDate(nextEvent.when).setZone(tz);
        executiveLines.push(
          `- Prochain jalon détecté ${describeRelativeMoment(nextStart, now)}: ${nextEvent.title}.`,
        );
      } else {
        executiveLines.push(
          `- Aucun jalon calendrier clair sur la fenêtre analysée: pense à créer un point de passage.`,
        );
      }

      if (matchedMails.length) {
        executiveLines.push(
          `- Les emails sont un levier immédiat pour cette mission.`,
        );
      } else if (unreadMails && unreadMails.length) {
        executiveLines.push(
          `- Il reste ${unreadMails.length} email(s) non lus qui peuvent perturber l'exécution.`,
        );
      } else if (unreadMails === null) {
        executiveLines.push(
          `- Gmail n'est pas connecté, donc vision incomplète côté email.`,
        );
      }

      const signalLines = [
        matchedEvents.length
          ? `- Agenda: ${matchedEvents
              .map((event) => `${formatDate(event.when, tz)} — ${event.title}`)
              .join(' | ')}`
          : nextEvent
            ? `- Agenda: prochain rendez-vous ${formatDate(nextEvent.when, tz)} — ${nextEvent.title}`
            : `- Agenda: aucun signal spécifique sur la fenêtre.`,
        matchedMails.length
          ? `- Emails: ${matchedMails
              .map((mail) => `${mail.subject} (${mail.from})`)
              .join(' | ')}`
          : unreadMails === null
            ? `- Emails: indisponibles (Gmail non connecté).`
            : `- Emails: aucun email clairement rattaché à l'objectif.`,
        matchedNotes.length
          ? `- Notes: ${matchedNotes
              .map((note) => noteLabel(note))
              .join(' | ')}`
          : `- Notes: aucune note directement reliée détectée.`,
        matchedTodos.length
          ? `- Todos: ${matchedTodos.map((todo) => todo.text).join(' | ')}`
          : `- Todos: aucune action déjà ouverte clairement liée.`,
      ];

      const planSteps: string[] = [];
      if (matchedMails.length) {
        const leadMail = matchedMails[0];
        planSteps.push(
          `1. Ouvre la mission par le signal externe le plus chaud: traite l'email "${leadMail.subject}" de ${leadMail.from}.`,
        );
      } else if (matchedNotes.length) {
        planSteps.push(
          `1. Commence par consolider la base de connaissance existante autour de ${compactText(objective, 80)}.`,
        );
      } else {
        planSteps.push(
          `1. Cadre l'objectif en 2 ou 3 livrables mesurables avant toute exécution.`,
        );
      }

      if (matchedNotes.length) {
        const leadNote = matchedNotes[0];
        planSteps.push(
          `${planSteps.length + 1}. Réactive la matière existante via la note "${noteLabel(leadNote)}" pour éviter de repartir à zéro.`,
        );
      }

      if (matchedTodos.length) {
        planSteps.push(
          `${planSteps.length + 1}. Regroupe les actions déjà ouvertes liées à cette mission et clarifie leur ordre d'exécution.`,
        );
      } else {
        planSteps.push(
          `${planSteps.length + 1}. Transforme la mission en au moins un todo exécutable dès maintenant.`,
        );
      }

      if (nextEvent) {
        planSteps.push(
          `${planSteps.length + 1}. Utilise ${nextEvent.title} comme jalon de contrôle et prépare ce qui doit être prêt avant ${formatClock(nextEvent.when, tz)}.`,
        );
      } else {
        planSteps.push(
          `${planSteps.length + 1}. Réserve un créneau protégé de 45 à 90 minutes dans la fenêtre pour faire avancer la mission sans interruption.`,
        );
      }

      if (planSteps.length < 4) {
        planSteps.push(
          `${planSteps.length + 1}. Termine par une revue courte: ce qui est prêt, ce qui bloque, et la prochaine action visible.`,
        );
      }

      const riskLines: string[] = [];
      if (matchedMails.some((mail) => mail.urgencyScore >= 5)) {
        riskLines.push(
          `- Un email critique peut re-prioriser la mission à court terme.`,
        );
      }
      if (todos.length >= 6) {
        riskLines.push(
          `- La charge ouverte actuelle est déjà élevée (${todos.length} todos ouverts).`,
        );
      }
      if (
        !matchedTodos.length &&
        !matchedNotes.length &&
        !matchedEvents.length
      ) {
        riskLines.push(
          `- Faible empreinte contextuelle: risque de lancer une mission mal cadrée.`,
        );
      }
      if (shopping.length >= 6) {
        riskLines.push(
          `- Beaucoup d'éléments annexes restent ouverts en parallèle (${shopping.length} courses).`,
        );
      }
      if (!riskLines.length) {
        riskLines.push(
          `- Aucun risque majeur immédiat détecté sur la base des signaux disponibles.`,
        );
      }

      const suggestedCommands = [
        matchedMails.length
          ? `Résume l'email ${matchedMails[0].subject}`
          : null,
        keywordPhrase ? `Cherche mes notes sur ${keywordPhrase}` : null,
        matchedTodos.length ? `Liste mes todos` : `Ajoute le todo ${objective}`,
        nextEvent
          ? `Montre-moi mon agenda d'aujourd'hui`
          : `Planifie un créneau demain pour ${objective}`,
      ]
        .filter((item): item is string => !!item)
        .filter((item, index, list) => list.indexOf(item) === index)
        .slice(0, 4);

      return [
        `Mission plan - ${objective}`,
        `Fenetre tactique: ${formatMissionWindow(startIso, endIso, tz)} (${horizonLabel})`,
        `Complexite estimee: ${missionComplexityLabel(complexityScore)}`,
        ``,
        `Evaluation tactique`,
        ...executiveLines,
        ``,
        `Signaux pertinents`,
        ...signalLines,
        ``,
        `Plan recommande`,
        ...planSteps,
        ``,
        `Risques`,
        ...riskLines,
        ``,
        `Commandes suggerees`,
        ...suggestedCommands.map((command) => `- ${command}`),
      ].join('\n');
    },
  }),
];
