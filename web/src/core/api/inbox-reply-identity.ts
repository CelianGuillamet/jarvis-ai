type ReplyIntent = {
  conversationId: string;
  messageId: string;
  replyText: string;
  archiveAfter: boolean;
  reviewedReply?: { to: string; subject: string };
};

function storageKey(conversationId: string, messageId: string) {
  return `jarvis.reply.${encodeURIComponent(conversationId)}.${encodeURIComponent(messageId)}`;
}

/** Preserve one attempt across transport failures, reloads and concurrent tabs. */
export async function replyRequestId(intent: ReplyIntent): Promise<string> {
  if (!intent.conversationId || !navigator.locks)
    throw new Error('La reprise sécurisée des envois nécessite un navigateur compatible.');
  const bytes = new TextEncoder().encode(JSON.stringify([intent.replyText.trim(), intent.archiveAfter, intent.reviewedReply ?? null]));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const key = storageKey(intent.conversationId, intent.messageId);
  return navigator.locks.request(key, () => {
    const saved = localStorage.getItem(key);
    if (saved) {
      const entry = JSON.parse(saved) as { requestId?: unknown; digest?: unknown; settled?: unknown };
      if (entry.digest !== digest && entry.settled === true) {
        const requestId = crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify({ requestId, digest }));
        return requestId;
      }
      if (typeof entry.requestId !== 'string' || entry.digest !== digest)
        throw new Error('Une réponse précédente reste à vérifier. Reprends son texte sans créer un nouvel envoi.');
      return entry.requestId;
    }
    const requestId = crypto.randomUUID();
    // Do not send when persistence fails: a reload must retain the same identity.
    localStorage.setItem(key, JSON.stringify({ requestId, digest }));
    return requestId;
  });
}

export async function completeReplyRequest(conversationId: string, messageId: string, requestId: string) {
  const key = storageKey(conversationId, messageId);
  await navigator.locks.request(key, () => {
    const saved = localStorage.getItem(key);
    if (saved && (JSON.parse(saved) as { requestId?: unknown }).requestId === requestId)
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(saved), settled: true }));
  });
}
