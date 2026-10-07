import { CommandRejectedError } from '../../../commands/command-rejected.error';
import { DateTime } from 'luxon';
import { RangeParseError } from '../../lib/resolve-range';
import { resolveWhenWindow } from '../../lib/resolve-when';
import {
  setLastCalendarList,
  getLastCalendarList,
  setLastCalendarFocus,
  patchCalendarInCache,
  removeCalendarFromCache,
} from '../support/tool-caches';
import {
  formatDate,
  resolveCalendarInterval,
  formatDurationMinutes,
} from '../support/tool-text';
import { defineTool } from '../define-tool';

export const calendarTools = [
  defineTool({
    name: 'calendar.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'calendar.read',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      try {
        const interval = resolveCalendarInterval(call.args, tz);
        if (interval.error !== null) return interval.error;
        const limit = call.args.limit ?? 20;

        const events = await ctx.calendar.listEventsInterval(
          sessionId,
          interval.startIso,
          interval.endIso,
          tz,
          limit,
        );
        setLastCalendarList(sessionId, events);
        if (events.length === 1) setLastCalendarFocus(sessionId, events[0]);

        if (!events.length) return 'Aucun événement sur cette période.';

        return (
          `Rendez-vous:\n` +
          events
            .map(
              (e, idx) =>
                `#${idx + 1} - ${formatDate(e.when, tz)} — ${e.title}`,
            )
            .join('\n')
        );
      } catch (e: any) {
        if (e instanceof RangeParseError) {
          if (/période trop large/i.test(e.message ?? '')) {
            return `${e.message} Réduis la plage (ex: "2 mois", "dans 8 semaines").`;
          }
          return `Je n’ai pas compris la période (“${call.args.rangeText ?? call.args.startIso ?? 'inconnue'}”). Exemples : "aujourd’hui", "2 semaines", "du 12 au 18 mars", "avril 2026".`;
        }
        throw e;
      }
    },
  }),
  defineTool({
    name: 'calendar.has',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'calendar.read',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      try {
        const interval = resolveCalendarInterval(call.args, tz);
        if (interval.error !== null) return interval.error;
        const events = await ctx.calendar.listEventsInterval(
          sessionId,
          interval.startIso,
          interval.endIso,
          tz,
          20,
        );
        setLastCalendarList(sessionId, events);
        if (events.length === 1) setLastCalendarFocus(sessionId, events[0]);

        if (!events.length) {
          return 'Non, aucun rendez-vous sur cette période.';
        }

        return [
          events.length === 1
            ? 'Oui, tu as 1 rendez-vous sur cette période:'
            : `Oui, tu as ${events.length} rendez-vous sur cette période:`,
          ...events.map(
            (event, idx) =>
              `#${idx + 1} - ${formatDate(event.when, tz)} — ${event.title}`,
          ),
        ].join('\n');
      } catch (e: any) {
        if (e instanceof RangeParseError) {
          if (/période trop large/i.test(e.message ?? '')) {
            return `${e.message} Réduis la plage (ex: "2 mois", "dans 8 semaines").`;
          }
          return `Je n’ai pas compris la période (“${call.args.when ?? call.args.startIso ?? 'inconnue'}”). Exemples : "le 17 mars", "aujourd’hui", "2 semaines", "avril 2026".`;
        }
        throw e;
      }
    },
  }),
  defineTool({
    name: 'calendar.duration',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'calendar.read',
    deferred: false,
    handler: async (env, call) => {
      const { tz, sessionId } = env;
      const { resolveCalendarTarget } = env.resolvers;
      const { target, error } = await resolveCalendarTarget(call.args);
      if (error) return error;
      if (!target) return 'Aucun rendez-vous ciblé.';

      const list = getLastCalendarList(sessionId);
      const resolvedRef =
        list.findIndex(
          (event) =>
            event.provider === target.provider &&
            event.eventId === target.eventId &&
            (event.calendarId ?? '') === (target.calendarId ?? ''),
        ) + 1;

      const endDate =
        target.end && target.end.getTime() > target.when.getTime()
          ? target.end
          : DateTime.fromJSDate(target.when).plus({ minutes: 60 }).toJSDate();
      const durationMinutes = DateTime.fromJSDate(endDate).diff(
        DateTime.fromJSDate(target.when),
        'minutes',
      ).minutes;
      const durationText = formatDurationMinutes(durationMinutes);

      const label = resolvedRef > 0 ? `#${resolvedRef}` : `"${target.title}"`;
      return `Le rendez-vous ${label} ("${target.title}") dure ${durationText} (${formatDate(target.when, tz)} → ${formatDate(endDate, tz)}).`;
    },
  }),
  defineTool({
    name: 'calendar.create',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'calendar.write',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      const startIsoRaw = call.args.when.trim();
      if (!startIsoRaw)
        throw new CommandRejectedError('La date de début est vide.');

      const startParsed = DateTime.fromISO(startIsoRaw, { zone: tz });
      if (!startParsed.isValid)
        throw new CommandRejectedError(
          `Date de début invalide: "${call.args.when}".`,
        );

      const endIsoRaw = call.args.endWhen?.trim();
      const endParsed = endIsoRaw
        ? DateTime.fromISO(endIsoRaw, { zone: tz })
        : DateTime.invalid('no-end');
      const effectiveEnd = endParsed.isValid
        ? endParsed
        : startParsed.plus({ minutes: 60 });
      if (effectiveEnd <= startParsed) {
        throw new CommandRejectedError(
          'L’heure de fin doit être après l’heure de début.',
        );
      }

      if (ctx.simulation) {
        ctx.recordUndo?.('création événement (simulation)', false);
        return `SIMULATION: événement "${call.args.title}" prévu de ${startParsed.toISO({ suppressMilliseconds: true })} à ${effectiveEnd.toISO({ suppressMilliseconds: true })}.`;
      }

      await ctx.calendar.createEvent(
        sessionId,
        call.args.title,
        startParsed.toISO({ suppressMilliseconds: true }),
        tz,
        effectiveEnd.toISO({ suppressMilliseconds: true }),
      );

      ctx.recordUndo?.('création événement calendrier', false);
      return `OK. Événement créé: "${call.args.title}" de ${startParsed.toISO({ suppressMilliseconds: true })} à ${effectiveEnd.toISO({ suppressMilliseconds: true })}`;
    },
  }),
  defineTool({
    name: 'calendar.delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'calendar.write',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      const { resolveCalendarTarget } = env.resolvers;
      const { target, error } = await resolveCalendarTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun rendez-vous ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        ctx.recordUndo?.('suppression événement (simulation)', false);
        return `SIMULATION: supprimé — ${formatDate(target.when, tz)} — ${target.title}`;
      }

      await ctx.calendar.deleteEvent(
        sessionId,
        target.provider,
        target.eventId,
        target.calendarId,
      );
      removeCalendarFromCache(sessionId, target);

      ctx.recordUndo?.('suppression événement calendrier', false);
      return `OK. Supprimé — ${formatDate(target.when, tz)} — ${target.title}`;
    },
  }),
  defineTool({
    name: 'calendar.update',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'calendar.write',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      const { resolveCalendarTarget } = env.resolvers;
      const { target, error } = await resolveCalendarTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun rendez-vous ciblé.', 'NOT_FOUND');
      const targetStart = DateTime.fromJSDate(target.when).setZone(tz);
      const targetEnd =
        target.end && target.end.getTime() > target.when.getTime()
          ? DateTime.fromJSDate(target.end).setZone(tz)
          : targetStart.plus({ minutes: 60 });

      const nextTitle =
        call.args.title && call.args.title.trim()
          ? call.args.title.trim()
          : target.title;

      let nextStart = targetStart;
      let nextEnd = targetEnd;

      if (call.args.when && call.args.when.trim()) {
        const whenRaw = call.args.when.trim();
        const whenIsoParsed = DateTime.fromISO(whenRaw, { zone: tz });

        if (whenIsoParsed.isValid) {
          nextStart = whenIsoParsed;
        } else {
          const resolved = resolveWhenWindow(whenRaw, tz, {
            baseDate: targetStart,
            defaultHour: targetStart.hour,
            defaultMinute: targetStart.minute,
          });
          nextStart = DateTime.fromISO(resolved.startIso, { zone: tz });
          if (resolved.endIso) {
            const resolvedEnd = DateTime.fromISO(resolved.endIso, {
              zone: tz,
            });
            if (resolvedEnd.isValid) nextEnd = resolvedEnd;
          }
        }

        if (!(call.args.endWhen && call.args.endWhen.trim())) {
          const durationMs = Math.max(
            60_000,
            targetEnd.toMillis() - targetStart.toMillis(),
          );
          nextEnd = nextStart.plus({ milliseconds: durationMs });
        }
      }

      if (call.args.endWhen && call.args.endWhen.trim()) {
        const endRaw = call.args.endWhen.trim();
        let parsedEnd = DateTime.fromISO(endRaw, { zone: tz });
        if (!parsedEnd.isValid) {
          const resolvedEnd = resolveWhenWindow(endRaw, tz, {
            baseDate: nextStart,
            defaultHour: targetEnd.hour,
            defaultMinute: targetEnd.minute,
          });
          parsedEnd = DateTime.fromISO(resolvedEnd.startIso, { zone: tz });
        }
        if (!parsedEnd.isValid) {
          throw new CommandRejectedError(
            `Heure de fin invalide: "${call.args.endWhen}".`,
          );
        }
        if (parsedEnd <= nextStart) parsedEnd = parsedEnd.plus({ days: 1 });
        nextEnd = parsedEnd;
      }

      if (nextEnd <= nextStart) {
        throw new CommandRejectedError(
          'L’heure de fin doit être après l’heure de début.',
        );
      }

      const nextWhenIso = nextStart.toISO({ suppressMilliseconds: true })!;
      const nextEndWhenIso = nextEnd.toISO({ suppressMilliseconds: true })!;

      if (ctx.simulation) {
        ctx.recordUndo?.('modification événement (simulation)', false);
        return `SIMULATION: modifié — ${nextTitle} de ${nextWhenIso} à ${nextEndWhenIso}`;
      }

      await ctx.calendar.updateEvent(
        sessionId,
        target.provider,
        target.eventId,
        target.calendarId,
        nextTitle,
        nextWhenIso,
        tz,
        nextEndWhenIso,
      );

      patchCalendarInCache(sessionId, target, {
        title: nextTitle,
        when: nextStart.toJSDate(),
        end: nextEnd.toJSDate(),
      });

      ctx.recordUndo?.('modification événement calendrier', false);
      return `OK. Événement modifié: ${nextTitle} de ${nextWhenIso} à ${nextEndWhenIso}`;
    },
  }),
];
