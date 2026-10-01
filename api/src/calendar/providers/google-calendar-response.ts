import { BadGatewayException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { z } from 'zod';

const identifier = z.string().refine((value) => value.trim().length > 0);
const eventTime = z
  .object({ dateTime: z.string().optional(), date: z.string().optional() })
  .refine((value) => {
    const iso = value.dateTime ?? value.date;
    return !!iso && DateTime.fromISO(iso).isValid;
  })
  .transform((value) => value.dateTime ?? value.date!);

export const CalendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: identifier,
        summary: z.string().optional(),
        selected: z.boolean().optional(),
        primary: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const CalendarEventsSchema = z.object({
  items: z
    .array(
      z.object({
        id: identifier,
        summary: z.string().optional(),
        start: eventTime,
        end: eventTime,
      }),
    )
    .optional(),
});

export function validateCalendarResponse<T>(
  payload: unknown,
  schema: z.ZodType<T>,
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new BadGatewayException({
      code: 'INVALID_RESPONSE',
      message: 'La réponse du calendrier est invalide.',
    });
  }
  return result.data;
}
