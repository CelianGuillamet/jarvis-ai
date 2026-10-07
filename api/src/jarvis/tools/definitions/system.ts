import { asGoogleIntegrationError } from '../../../google/google-integration.error';
import { dataUnavailable } from '../../../http/data-unavailable';
import { DateTime } from 'luxon';
import { resolveRange } from '../../lib/resolve-range';
import { WEB_DISABLED_MESSAGE } from '../../providers/web.provider';
import type { GmailMessageItem } from '../../../gmail/providers/gmail.provider';
import {
  formatDate,
  formatMailDate,
  compactText,
  formatClock,
  describeRelativeMoment,
  scoreMailUrgency,
  attentionLabel,
} from '../support/tool-text';
import { defineTool } from '../define-tool';

export const systemTools = [
  defineTool({
    name: 'weather.forecast',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const day = call.args.day ?? 'today';
      const requestedLocation = (call.args.location ?? '').trim();
      let location = requestedLocation;
      let usedDefaultLocation = false;

      if (!location) {
        const snapshot = await ctx.memory.getSnapshot(sessionId);
        const allFacts = Object.values(snapshot.factsByLayer).flat();
        const preferredLocation =
          allFacts.find(
            (fact) =>
              fact.key === 'home_city' ||
              fact.key === 'location_city' ||
              fact.key === 'city',
          )?.value ?? '';
        location = preferredLocation.trim();
      }

      if (!location) {
        usedDefaultLocation = true;
        location = 'Paris';
      }

      try {
        const forecast = await ctx.weather.getDailyForecast({
          location,
          day,
          tz: ctx.tz,
        });

        const parts: string[] = [];
        if (forecast.day.description) parts.push(forecast.day.description);
        parts.push(`${forecast.day.tempMinC}–${forecast.day.tempMaxC}°C`);
        if (typeof forecast.day.precipitationProbMax === 'number') {
          parts.push(`pluie max ${forecast.day.precipitationProbMax}%`);
        }
        if (typeof forecast.day.windMaxKmh === 'number') {
          parts.push(`vent max ${forecast.day.windMaxKmh} km/h`);
        }

        const label = day === 'tomorrow' ? 'Demain' : "Aujourd'hui";
        const line = `${label} (${forecast.day.date}) — ${forecast.resolvedLocation}: ${parts.join(', ')}.`;
        const note = usedDefaultLocation
          ? `Note: je n'ai pas ta ville. Dis-moi "météo demain à <ville>" pour une localisation précise.`
          : null;

        return [line, note].filter((x): x is string => !!x).join('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur météo';
        return `Météo indisponible: ${message}`;
      }
    },
  }),
  defineTool({
    name: 'web.search',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: () => {
      return WEB_DISABLED_MESSAGE;
    },
  }),
  defineTool({
    name: 'web.open',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: () => {
      return WEB_DISABLED_MESSAGE;
    },
  }),
  defineTool({
    name: 'undo.last_action',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: () => {
      return 'Le retour arrière nécessite une commande vérifiée.';
    },
  }),
  defineTool({
    name: 'action.history',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, tz, sessionId } = env;
      const status = call.args.status ?? 'all';
      const limit = Math.min(Math.max(call.args.limit ?? 8, 1), 12);
      const events = await prisma.jarvisActionEvent.findMany({
        where: {
          sessionId,
          ...(status === 'pending' ? { status: 'pending' } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          toolName: true,
          summary: true,
          status: true,
          resultPreview: true,
          errorMessage: true,
          createdAt: true,
        },
      });

      if (!events.length) {
        return status === 'pending'
          ? 'Aucune action en attente.'
          : 'Aucune action récente enregistrée.';
      }

      return `Historique des actions (${status}):\n${events
        .map((event) => {
          const at = DateTime.fromJSDate(event.createdAt).setZone(tz);
          const outcome =
            event.status === 'completed'
              ? event.resultPreview
              : event.errorMessage;
          return `- ${at.toFormat('dd/LL HH:mm')} | ${event.status} | ${event.summary}${outcome ? ` — ${compactText(outcome, 120)}` : ''}`;
        })
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'workflow.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { prisma, sessionId } = env;
      const limit = Math.min(Math.max(call.args.limit ?? 5, 1), 10);
      const workflows = await prisma.jarvisWorkflowMemory.findMany({
        where: { sessionId },
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        select: {
          triggerSummary: true,
          followUpPrompt: true,
          usageCount: true,
        },
      });

      if (!workflows.length) {
        return 'Aucun workflow appris pour le moment.';
      }

      return `Workflows appris:\n${workflows
        .map(
          (workflow, index) =>
            `- #${index + 1} - Après ${workflow.triggerSummary} -> ${workflow.followUpPrompt} (${workflow.usageCount} fois)`,
        )
        .join('\n')}`;
    },
  }),
  defineTool({
    name: 'daily.briefing',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, prisma, tz, sessionId } = env;
      const [todos, shopping, activeMissions] = await Promise.all([
        prisma.todo.findMany({
          where: { done: false },
          orderBy: { createdAt: 'asc' },
          select: { text: true },
        }),
        prisma.shoppingItem.findMany({
          where: { bought: false },
          orderBy: { createdAt: 'asc' },
          select: { text: true },
        }),
        prisma.jarvisMission.findMany({
          where: {
            sessionId,
            status: 'active',
          },
          orderBy: { updatedAt: 'desc' },
          take: 3,
          select: {
            objective: true,
            horizon: true,
            summary: true,
            nextStep: true,
          },
        }),
      ]);

      let unreadMails: GmailMessageItem[] | null = null;
      try {
        unreadMails = await ctx.gmail.listMessages(sessionId, {
          q: 'is:unread',
          maxResults: 5,
        });
      } catch (error) {
        const code = asGoogleIntegrationError(error)?.code;
        if (code !== 'GMAIL_NOT_CONNECTED' && code !== 'GOOGLE_NOT_CONNECTED')
          throw error;
        unreadMails = null;
      }

      const { startIso, endIso } = resolveRange("aujourd'hui", tz);
      const events = await ctx.calendar.listEventsInterval(
        sessionId,
        startIso,
        endIso,
        tz,
        20,
      );
      const now = DateTime.now().setZone(tz);
      const sortedEvents = [...events].sort(
        (a, b) => a.when.getTime() - b.when.getTime(),
      );
      const currentEvent =
        sortedEvents.find((event) => {
          const start = DateTime.fromJSDate(event.when).setZone(tz);
          const end = DateTime.fromJSDate(event.end ?? event.when).setZone(tz);
          return start <= now && end >= now;
        }) ?? null;
      const nextEvent =
        currentEvent ??
        sortedEvents.find((event) => {
          const end = DateTime.fromJSDate(event.end ?? event.when).setZone(tz);
          return end >= now;
        }) ??
        null;

      const scoredUnread =
        unreadMails?.map((mail) => ({
          ...mail,
          urgencyScore: scoreMailUrgency(mail, now),
        })) ?? [];
      const priorityMails = [...scoredUnread]
        .filter((mail) => mail.urgencyScore >= 3)
        .sort((a, b) => {
          if (b.urgencyScore !== a.urgencyScore) {
            return b.urgencyScore - a.urgencyScore;
          }
          return b.date.getTime() - a.date.getTime();
        })
        .slice(0, 3);

      let attentionScore = 0;
      if (currentEvent) {
        attentionScore += 4;
      } else if (nextEvent) {
        const nextStart = DateTime.fromJSDate(nextEvent.when).setZone(tz);
        const diffMinutes = nextStart.diff(now, 'minutes').minutes;
        if (diffMinutes <= 60) attentionScore += 3;
        else if (diffMinutes <= 180) attentionScore += 2;
        else attentionScore += 1;
      }
      if (priorityMails.length) {
        attentionScore += priorityMails[0].urgencyScore >= 5 ? 3 : 2;
      } else if (unreadMails && unreadMails.length >= 5) {
        attentionScore += 1;
      }
      if (todos.length >= 5) attentionScore += 1;
      if (shopping.length >= 6) attentionScore += 1;

      const topMission = activeMissions[0] ?? null;
      const summaryLines: string[] = [];
      if (currentEvent) {
        const endText = currentEvent.end
          ? ` jusqu'à ${formatClock(currentEvent.end, tz)}`
          : '';
        summaryLines.push(
          `- Rendez-vous en cours${endText}: ${currentEvent.title}.`,
        );
      } else if (nextEvent) {
        const nextStart = DateTime.fromJSDate(nextEvent.when).setZone(tz);
        summaryLines.push(
          `- Prochain rendez-vous ${describeRelativeMoment(nextStart, now)}: ${nextEvent.title} à ${formatClock(nextEvent.when, tz)}.`,
        );
      } else {
        summaryLines.push(`- Aucun rendez-vous restant aujourd'hui.`);
      }

      if (unreadMails === null) {
        summaryLines.push(`- Gmail non connecté pour cette session.`);
      } else if (priorityMails.length) {
        summaryLines.push(
          `- ${priorityMails.length} email(s) prioritaire(s) non lus demandent de l'attention.`,
        );
      } else if (unreadMails.length) {
        summaryLines.push(
          `- ${unreadMails.length} email(s) non lus, sans signal critique majeur.`,
        );
      } else {
        summaryLines.push(`- Aucun email non lu.`);
      }

      summaryLines.push(
        `- ${todos.length} todo(s) ouvert(s) et ${shopping.length} article(s) en attente.`,
      );
      if (topMission) {
        const horizon = topMission.horizon ? ` (${topMission.horizon})` : '';
        const detail = topMission.nextStep || topMission.summary;
        summaryLines.push(
          `- Mission active clé: ${topMission.objective}${horizon}${detail ? ` — ${compactText(detail, 120)}` : ''}.`,
        );
      } else {
        summaryLines.push(`- Aucune mission active persistée pour l'instant.`);
      }

      const radarLines: string[] = [];
      if (topMission) {
        radarLines.push(
          `- Mission | ${topMission.objective}${topMission.nextStep ? ` | prochaine étape: ${compactText(topMission.nextStep, 96)}` : ''}`,
        );
      }
      if (currentEvent) {
        radarLines.push(
          `- En cours | ${currentEvent.title}${currentEvent.end ? ` jusqu'à ${formatClock(currentEvent.end, tz)}` : ''}`,
        );
      } else if (nextEvent) {
        radarLines.push(
          `- Agenda | ${formatClock(nextEvent.when, tz)} | ${nextEvent.title}`,
        );
      }
      for (const mail of priorityMails.slice(0, 2)) {
        radarLines.push(`- Email | ${mail.subject} (${mail.from})`);
      }
      for (const todo of todos.slice(0, 2)) {
        radarLines.push(`- Todo | ${todo.text}`);
      }
      if (!radarLines.length) {
        radarLines.push(`- Aucun point chaud détecté.`);
      }

      const calendarLines = sortedEvents.length
        ? sortedEvents.map(
            (event) => `- ${formatDate(event.when, tz)} — ${event.title}`,
          )
        : [`- Aucun événement aujourd'hui.`];

      const mailLines =
        unreadMails === null
          ? [`- Gmail non connecté.`]
          : priorityMails.length
            ? priorityMails.map(
                (mail) =>
                  `- ${mail.subject} (${mail.from}) — reçu ${formatMailDate(mail.date, tz)}`,
              )
            : unreadMails.length
              ? unreadMails
                  .slice(0, 3)
                  .map(
                    (mail) =>
                      `- ${mail.subject} (${mail.from}) — reçu ${formatMailDate(mail.date, tz)}`,
                  )
              : [`- Aucun email non lu.`];

      const openLoopsLines = [
        topMission
          ? `- Mission: ${topMission.objective}${topMission.nextStep ? ` | prochaine étape: ${compactText(topMission.nextStep, 96)}` : ''}`
          : `- Mission: aucune mission active structurée.`,
        todos.length
          ? `- Todos: ${todos
              .slice(0, 4)
              .map((todo) => todo.text)
              .join(' | ')}`
          : `- Todos: aucun blocage ouvert.`,
        shopping.length
          ? `- Courses: ${shopping
              .slice(0, 4)
              .map((item) => item.text)
              .join(' | ')}`
          : `- Courses: rien d'ouvert.`,
      ];

      return [
        `Briefing du jour - ${now.toFormat('cccc d LLLL yyyy')}`,
        `Heure locale: ${now.toFormat('HH:mm')} (${tz})`,
        `Niveau d'attention: ${attentionLabel(attentionScore)}`,
        ``,
        `Resume executif`,
        ...summaryLines,
        ``,
        `Radar immediat`,
        ...radarLines,
        ``,
        `Calendrier`,
        ...calendarLines,
        ``,
        `Emails`,
        ...mailLines,
        ``,
        `Boucles ouvertes`,
        ...openLoopsLines,
      ].join('\n');
    },
  }),
  defineTool({
    name: 'conflict.detect',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env) => {
      const { ctx, sessionId } = env;
      if (!ctx.conflicts) throw dataUnavailable();
      const reports = await ctx.conflicts.detectAllConflicts(sessionId);
      if (!reports.length) return 'Aucun conflit détecté.';
      return reports
        .map(
          (r) =>
            `[${r.severity.toUpperCase()}] ${r.type}: ${r.items.length} problème(s) — ${r.remediation}`,
        )
        .join('\n');
    },
  }),
  defineTool({
    name: 'help.create',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.help) throw dataUnavailable();
      const help = await ctx.help.createHelp(sessionId, {
        context: call.args.context,
        contentType: call.args.contentType,
        content: call.args.content,
        relevanceScore: call.args.relevanceScore,
      });
      if (!help) throw dataUnavailable();
      return `Aide créée [${help.id.slice(0, 8)}] pour contexte "${help.context}": ${help.contentType}`;
    },
  }),
  defineTool({
    name: 'help.find',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.help) throw dataUnavailable();
      const items = await ctx.help.findRelevant(sessionId, call.args.context);
      if (!items.length)
        return `Aucune aide disponible pour le contexte "${call.args.context}".`;
      return `${items.length} aide(s) pour "${call.args.context}":\n${items.map((h) => `- [${h.contentType}] ${h.content}`).join('\n')}`;
    },
  }),
  defineTool({
    name: 'search.query',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.search) throw dataUnavailable();
      const results = await ctx.search.query(sessionId, call.args);
      if (!results.length) return `Aucun résultat pour "${call.args.query}".`;
      return `${results.length} résultat(s) pour "${call.args.query}":\n${results.map((r) => `- [${r.type}] ${r.title}: ${r.snippet}`).join('\n')}`;
    },
  }),
  defineTool({
    name: 'time.record',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.timeInsights) throw dataUnavailable();
      const row = await ctx.timeInsights.record(sessionId, call.args);
      if (!row) throw dataUnavailable();
      return `OK. Métrique enregistrée: ${row.metricName} = ${row.value} ${row.unit}`;
    },
  }),
  defineTool({
    name: 'time.summary',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      if (!ctx.timeInsights) throw dataUnavailable();
      const summary = await ctx.timeInsights.summary(sessionId, call.args);
      const metricLines = Object.entries(summary.metrics).map(
        ([name, m]) =>
          `- ${name}: total ${m.total.toFixed(0)} ${m.unit}, moy ${m.avg.toFixed(0)}`,
      );
      if (!metricLines.length)
        return `Aucune donnée pour la période "${summary.period}".`;
      return `Résumé ${summary.period} (score: ${summary.productivityScore.toFixed(0)}/100):\n${metricLines.join('\n')}`;
    },
  }),
];
