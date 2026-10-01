import { BadGatewayException } from '@nestjs/common';
import { z } from 'zod';

const identifier = z.string().refine((value) => value.trim().length > 0);
export const GmailListSchema = z.object({
  messages: z.array(z.object({ id: identifier })).optional(),
});
const messagePart = z.object({
  mimeType: z.string().optional(),
  headers: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional(),
  body: z.object({ data: z.string().optional() }).optional(),
  get parts() {
    return z.array(messagePart).optional();
  },
});
export const GmailMessageSchema = z.object({
  id: identifier,
  threadId: identifier,
  internalDate: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number.isFinite(new Date(Number(value)).getTime())),
  labelIds: z.array(z.string()).optional(),
  snippet: z.string().optional(),
  payload: messagePart.optional(),
});

export function validateGmailResponse<T>(
  payload: unknown,
  schema: z.ZodType<T>,
): T {
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new BadGatewayException({
      code: 'INVALID_RESPONSE',
      message: 'La réponse de Gmail est invalide.',
    });
  return result.data;
}
