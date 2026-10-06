import { z } from "zod";
import {
  InvalidResponseError,
  HttpError,
  joinUrl,
} from "../../core/api/http.ts";

const headerSchema = z
  .object({
    type: z.literal("header"),
    formatVersion: z.literal(1),
    accountId: z.string().min(1),
    exportedAt: z.iso.datetime(),
  })
  .strict();
const recordSchema = z
  .object({
    type: z.literal("record"),
    collection: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
const completeSchema = z
  .object({
    type: z.literal("complete"),
    records: z.number().int().nonnegative(),
  })
  .strict();

export class ExportCapacityError extends Error {
  constructor(kind: "memory" | "record" = "memory") {
    super(
      kind === "record"
        ? "Un élément de cet export est trop volumineux pour être vérifié. Contactez l’assistance."
        : "Cet export dépasse la capacité de téléchargement de ce navigateur. Utilisez un navigateur proposant l’enregistrement direct de fichiers.",
    );
    this.name = "ExportCapacityError";
  }
}

export type SnapshotDestination = {
  write: (chunk: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

/** Never publish a partial export: completion follows the server transaction commit. */
export async function readAccountSnapshot(
  response: Response,
  accountId: string,
  destination?: SnapshotDestination,
): Promise<Blob | null> {
  if (!response.ok) {
    if (destination) await destination.abort().catch(() => undefined);
    throw new HttpError({
      status: response.status,
      message: "L’export n’a pas pu être téléchargé.",
    });
  }
  if (!response.body) {
    if (destination) await destination.abort().catch(() => undefined);
    throw new InvalidResponseError();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let pending = "";
  let headerSeen = false;
  let complete = false;
  let records = 0;
  let bytes = 0;
  const line = (text: string) => {
    if (text.length > 16 * 1024 * 1024) throw new ExportCapacityError("record");
    if (!text.trim()) throw new InvalidResponseError();
    const value: unknown = JSON.parse(text);
    if (!headerSeen) {
      const header = headerSchema.parse(value);
      if (header.accountId !== accountId) throw new InvalidResponseError();
      headerSeen = true;
    } else if (complete) throw new InvalidResponseError();
    else {
      const footer = completeSchema.safeParse(value);
      if (footer.success) {
        if (footer.data.records !== records) throw new InvalidResponseError();
        complete = true;
      } else {
        recordSchema.parse(value);
        records++;
      }
    }
  };
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      // Native file destinations stream without retaining the export in memory.
      if (!destination && bytes > 64 * 1024 * 1024)
        throw new ExportCapacityError();
      pending += decoder.decode(part.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        line(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (pending.length > 16 * 1024 * 1024)
        throw new ExportCapacityError("record");
      if (destination) await destination.write(part.value);
      else chunks.push(part.value.slice());
    }
    pending += decoder.decode();
    if (pending) line(pending);
    if (!headerSeen || !complete) throw new InvalidResponseError();
    if (destination) {
      await destination.close();
      return null;
    }
    return new Blob(chunks, { type: "application/x-ndjson" });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (destination) await destination.abort().catch(() => undefined);
    if (error instanceof HttpError || error instanceof InvalidResponseError)
      throw error;
    if (error instanceof ExportCapacityError) throw error;
    throw new InvalidResponseError();
  } finally {
    reader.releaseLock();
  }
}

export async function downloadAccountSnapshot(
  baseUrl: string,
  accountId: string,
): Promise<"saved" | "download-started"> {
  type PickerWindow = Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
    }) => Promise<{ createWritable: () => Promise<SnapshotDestination> }>;
  };
  const filename = `jarvis-donnees-${new Date().toISOString().slice(0, 10)}.ndjson`;
  const picker = (window as PickerWindow).showSaveFilePicker;
  const destination = picker
    ? await (
        await picker.call(window, { suggestedName: filename })
      ).createWritable()
    : undefined;
  let destinationOwnedByReader = false;
  try {
    const response = await fetch(joinUrl(baseUrl, "/account/export/snapshot"), {
      credentials: "include",
      signal: AbortSignal.timeout(65000),
      headers: { accept: "application/x-ndjson" },
    });
    if (response.status === 401)
      window.dispatchEvent(new Event("jarvis:session-expired"));
    destinationOwnedByReader = true;
    const blob = await readAccountSnapshot(response, accountId, destination);
    if (!blob) return "saved";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "download-started";
  } catch (error) {
    if (destination && !destinationOwnedByReader)
      await destination.abort().catch(() => undefined);
    throw error;
  }
}
