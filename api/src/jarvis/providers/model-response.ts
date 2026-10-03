import { BadGatewayException } from '@nestjs/common';
import { z } from 'zod';

const nonemptyText = z.string().refine((value) => value.trim().length > 0);
export const OllamaResponseSchema = z.object({
  done: z.literal(true),
  done_reason: z.literal('stop').optional(),
  message: z.object({ content: nonemptyText }),
});
export const ChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal('stop'),
        message: z.object({
          content: z.union([
            nonemptyText,
            z
              .array(z.object({ type: z.literal('text'), text: z.string() }))
              .min(1)
              .transform((parts) => parts.map((part) => part.text).join(''))
              .pipe(nonemptyText),
          ]),
        }),
      }),
    )
    .min(1),
});
export const ResponsesResponseSchema = z
  .object({
    status: z.literal('completed'),
    error: z.null().optional(),
    output_text: nonemptyText.optional(),
    output: z
      .array(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('reasoning') }),
          z.object({
            type: z.literal('message'),
            status: z.literal('completed'),
            content: z
              .array(
                z.object({ type: z.literal('output_text'), text: z.string() }),
              )
              .min(1),
          }),
        ]),
      )
      .optional(),
  })
  .transform(
    (data) =>
      data.output_text ??
      (data.output ?? [])
        .flatMap((item) =>
          item.type === 'message' ? item.content.map((part) => part.text) : [],
        )
        .join(''),
  )
  .pipe(nonemptyText);

export class InvalidModelResponseError extends BadGatewayException {
  constructor() {
    super({
      code: 'INVALID_RESPONSE',
      message: 'La réponse du modèle est invalide ou incomplète.',
    });
  }
}

export async function readModelResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new InvalidModelResponseError();
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new InvalidModelResponseError();
  return parsed.data;
}
