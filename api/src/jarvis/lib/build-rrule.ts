import { DateTime } from 'luxon';
import { resolveRange } from './resolve-range';

const WD: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const BYDAY: Record<string, string> = {
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
  sunday: 'SU',
};

export function buildWeeklyRRuleForMonth(args: {
  tz: string;
  weekday: keyof typeof WD;
  time: string; // "15:00"
  monthText: string; // "juin 2026"
  durationMinutes?: number;
}) {
  const { tz, weekday, time, monthText } = args;
  const duration = args.durationMinutes ?? 60;

  const { startIso, endIso } = resolveRange(monthText, tz); // ton resolveRange gère "juin 2026"
  const monthStart = DateTime.fromISO(startIso, { zone: tz }).startOf('day');
  const monthEnd = DateTime.fromISO(endIso, { zone: tz }).endOf('day');

  const [hh, mm] = time.split(':').map(Number);

  // 1) DTSTART = premier weekday du mois
  let first = monthStart;
  while (first.weekday !== WD[weekday]) first = first.plus({ days: 1 });
  first = first.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });

  // 2) DTEND = DTSTART + durée
  const end = first.plus({ minutes: duration });

  // 3) UNTIL = fin du mois (en UTC Z pour être explicite)
  const untilUtc = monthEnd
    .toUTC()
    .set({ hour: 23, minute: 59, second: 59, millisecond: 0 });
  const until = untilUtc.toFormat("yyyyLLdd'T'HHmmss'Z'");

  // 4) RRULE
  const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[weekday]};UNTIL=${until}`;

  return {
    start: {
      dateTime: first.toISO({ suppressMilliseconds: true })!,
      timeZone: tz,
    },
    end: { dateTime: end.toISO({ suppressMilliseconds: true })!, timeZone: tz },
    recurrence: [rrule],
  };
}
