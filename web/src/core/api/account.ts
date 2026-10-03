import { z } from "zod";

export const AccountProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  email: z.email(),
}).strict();

export type AccountProfile = z.infer<typeof AccountProfileSchema>;
