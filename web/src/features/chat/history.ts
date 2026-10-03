import type {
  ConversationHistoryResponse,
  JarvisChatResponse,
} from '../../core/contracts/v1';

export type HistoryMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: number;
  meta?: JarvisChatResponse['meta'];
};

/** Historical responses are evidence, never instructions to execute again. */
export function historyMessages(page: ConversationHistoryResponse): HistoryMessage[] {
  return page.turns.flatMap((turn): HistoryMessage[] => {
    const input: HistoryMessage = {
      id: `${turn.id}:input`,
      role: 'user',
      text: turn.kind === 'confirm' ? 'Confirmation de la commande proposée' : turn.inputText,
      createdAt: Date.parse(turn.createdAt),
    };
    if (turn.response) {
      return [input, {
        id: `${turn.id}:response`,
        role: 'assistant',
        text: turn.response.text,
        meta: turn.response.meta,
        createdAt: Date.parse(turn.updatedAt),
      }];
    }
    return [input, {
      id: `${turn.id}:response`,
      role: 'system',
      text: 'La réponse de cette demande n’a pas été enregistrée. Cela ne permet pas de déterminer si une action a eu lieu. Vérifie son résultat avant de renouveler la demande.',
      createdAt: Date.parse(turn.updatedAt),
    }];
  });
}

/** Only the server's current, unexpired command may regain confirmation controls. */
export function restoredPending(page: ConversationHistoryResponse, now = Date.now()) {
  const pending = page.pendingCommand;
  if (!pending || Date.parse(pending.expiresAt) <= now) return null;
  for (const turn of [...page.turns].reverse()) {
    if (turn.command?.id === pending.id && turn.command.state === 'waiting' &&
      turn.response?.pending_action?.id === pending.id) {
      return turn.response.pending_action;
    }
  }
  return null;
}
