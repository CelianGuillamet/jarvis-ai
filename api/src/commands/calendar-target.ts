import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CalendarEventItem } from '../calendar/providers/calendar.provider';

export class TargetResolutionError extends Error {}

export function freezeCalendarTarget(
  target: CalendarEventItem,
): Prisma.InputJsonObject {
  return {
    kind: 'calendar',
    provider: target.provider,
    eventId: target.eventId,
    calendarId: target.calendarId ?? null,
    title: target.title,
    when: target.when.toISOString(),
    end: target.end?.toISOString() ?? null,
  };
}

/** Old proposals without a resolved target must be proposed again, never retargeted. */
export function readCalendarTarget(
  targets: Prisma.JsonValue | undefined,
): CalendarEventItem {
  const target =
    Array.isArray(targets) && targets.length === 1 ? targets[0] : null;
  if (
    !target ||
    typeof target !== 'object' ||
    Array.isArray(target) ||
    target.kind !== 'calendar' ||
    (target.provider !== 'db' && target.provider !== 'google') ||
    typeof target.eventId !== 'string' ||
    !target.eventId ||
    typeof target.title !== 'string' ||
    typeof target.when !== 'string' ||
    !Number.isFinite(Date.parse(target.when)) ||
    !(target.calendarId === null || typeof target.calendarId === 'string') ||
    !(
      target.end === null ||
      (typeof target.end === 'string' &&
        Number.isFinite(Date.parse(target.end)))
    )
  ) {
    throw new BadRequestException(
      'Cible enregistrée indisponible. Propose à nouveau cette action.',
    );
  }
  return {
    provider: target.provider,
    eventId: target.eventId,
    calendarId: target.calendarId ?? undefined,
    title: target.title,
    when: new Date(target.when),
    end: target.end ? new Date(target.end) : undefined,
  };
}
