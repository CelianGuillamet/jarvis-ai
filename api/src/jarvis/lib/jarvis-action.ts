import type { ToolCall } from '../tools/tools';

export type AskAction = {
  type: 'ask';
  text: string;
  // optionnel: pour UI (boutons)
  choices?: string[];
  // optionnel: ce que Jarvis attend pour pouvoir agir ensuite
  awaiting?: 'calendar.range' | 'calendar.count' | 'generic';
};

export type FinalAction = { type: 'final'; text: string };

export type JarvisAction = ToolCall | AskAction | FinalAction;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function parseJarvisAction(jsonText: string): JarvisAction | null {
  let x: unknown;
  try {
    x = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isRecord(x) || typeof x.type !== 'string') return null;

  if (x.type === 'ask') {
    if (typeof x.text !== 'string') return null;
    if (x.choices && !Array.isArray(x.choices)) return null;
    const awaiting =
      x.awaiting === 'calendar.range' ||
      x.awaiting === 'calendar.count' ||
      x.awaiting === 'generic'
        ? x.awaiting
        : undefined;
    return {
      type: 'ask',
      text: x.text,
      choices: Array.isArray(x.choices)
        ? x.choices.filter((c): c is string => typeof c === 'string')
        : undefined,
      awaiting,
    };
  }

  // tool / final : tu gardes ton parse existant pour ToolCall et final
  return null; // on va l’intégrer juste après (voir étape 2)
}
