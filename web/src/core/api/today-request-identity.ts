import type { TodayMutation, TodayCommandResponse } from "../contracts/v1";
type Scope = { ownerId: string; sessionId: string };
function storageKey(scope: Scope, mutation: TodayMutation) {
  const lane =
    "id" in mutation
      ? `${mutation.operation.split(".")[0]}:${mutation.id}`
      : mutation.operation;
  return `jarvis.today.${encodeURIComponent(scope.ownerId)}.${encodeURIComponent(scope.sessionId)}.${encodeURIComponent(lane)}`;
}

/** Stores request identity and fingerprint only; no task or note text. */
export async function submitTodayRequest(
  scope: Scope,
  mutation: TodayMutation,
  submit: (requestId: string) => Promise<TodayCommandResponse>,
): Promise<TodayCommandResponse> {
  if (!scope.ownerId || !scope.sessionId || !navigator.locks)
    throw new Error(
      "La reprise sécurisée nécessite une session et un navigateur compatible.",
    );
  const canonical = JSON.stringify(
    Object.entries(mutation).sort(([a], [b]) => a.localeCompare(b)),
  );
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const digest = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const key = storageKey(scope, mutation);
  return navigator.locks.request(key, async () => {
    let requestId: string;
    const saved = localStorage.getItem(key);
    if (saved) {
      const entry: unknown = JSON.parse(saved);
      if (
        !entry ||
        typeof entry !== "object" ||
        !("requestId" in entry) ||
        typeof entry.requestId !== "string" ||
        !("digest" in entry) ||
        typeof entry.digest !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          entry.requestId,
        )
      )
        throw new Error(
          "Identité de reprise indisponible. Vérifiez l’action précédente.",
        );
      if (entry.digest !== digest) {
        if (!("settled" in entry) || entry.settled !== true)
          throw new Error(
            "Une action précédente reste à vérifier. Reprenez les mêmes valeurs avant de poursuivre.",
          );
        requestId = crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify({ requestId, digest }));
      } else requestId = entry.requestId;
    } else {
      requestId = crypto.randomUUID();
      localStorage.setItem(key, JSON.stringify({ requestId, digest }));
    }
    const result = await submit(requestId);
    // Keep the acknowledged identity too: a queued duplicate or another tab
    // must replay the same command instead of creating a second effect.
    if (result.state === "completed" || result.state === "failed")
      localStorage.setItem(
        key,
        JSON.stringify({ requestId, digest, settled: true }),
      );
    return result;
  });
}

/** Explicitly start a new user intent only after the previous outcome is known. */
export async function beginNewTodayIntent(
  scope: Scope,
  mutation: TodayMutation,
) {
  if (!navigator.locks) throw new Error("Navigateur incompatible.");
  const key = storageKey(scope, mutation);
  await navigator.locks.request(key, () => {
    const saved = localStorage.getItem(key);
    if (!saved) return;
    const entry: unknown = JSON.parse(saved);
    if (
      !entry ||
      typeof entry !== "object" ||
      !("settled" in entry) ||
      entry.settled !== true
    )
      throw new Error("Le résultat de l’action précédente reste à vérifier.");
    localStorage.removeItem(key);
  });
}
