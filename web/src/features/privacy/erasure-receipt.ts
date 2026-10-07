import { z } from "zod";
import { AccountErasureReceiptSchema } from "../../core/contracts/v1.ts";

export const ERASURE_RECEIPT_KEY = "jarvis.erasure.receipt.v1";
const pendingSchema = z
  .object({
    accountId: z.string().min(1).max(500),
    receipt: AccountErasureReceiptSchema,
  })
  .strict();

function readPending(storage?: Pick<Storage, "getItem">) {
  try {
    const raw = (storage ?? window.sessionStorage).getItem(ERASURE_RECEIPT_KEY);
    const result = pendingSchema.safeParse(raw ? JSON.parse(raw) : null);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function readErasureReceipt(
  storage?: Pick<Storage, "getItem">,
): string | null {
  return readPending(storage)?.receipt ?? null;
}

export function prepareErasureReceipt(
  accountId: string,
  storage?: Pick<Storage, "getItem" | "setItem">,
): string {
  if (!accountId) throw new Error("Compte indisponible.");
  const target = storage ?? window.sessionStorage;
  const existing = readPending(target);
  if (existing?.accountId === accountId) return existing.receipt;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const receipt = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  target.setItem(ERASURE_RECEIPT_KEY, JSON.stringify({ accountId, receipt }));
  const saved = readPending(target);
  if (saved?.receipt !== receipt || saved.accountId !== accountId)
    throw new Error("Le reçu ne peut pas être conservé dans cet onglet.");
  return receipt;
}
