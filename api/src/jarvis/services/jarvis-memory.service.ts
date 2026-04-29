import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export type MemoryLayer =
  | 'identity'
  | 'preference'
  | 'project'
  | 'relationship'
  | 'workflow';

export type MemoryFactItem = {
  layer: MemoryLayer;
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  updatedAt: string;
};

export type SessionSummaryTurn = {
  userText: string;
  assistantText: string;
  kind: 'ask' | 'final' | 'tool' | 'confirm' | 'error';
  toolName?: string;
};

export type SessionSummarySnapshot = {
  summary: string;
  highlights: string[];
  updatedAt: string;
};

export type JarvisWorldModelSnapshot = {
  factsByLayer: Record<MemoryLayer, MemoryFactItem[]>;
  sessionSummary: SessionSummarySnapshot | null;
};

type MemoryFactDraft = {
  layer: MemoryLayer;
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
};

const MEMORY_LAYERS: MemoryLayer[] = [
  'identity',
  'preference',
  'project',
  'relationship',
  'workflow',
];

const LAYER_LABELS: Record<MemoryLayer, string> = {
  identity: 'Identité',
  preference: 'Préférences',
  project: 'Projets',
  relationship: 'Relations',
  workflow: 'Workflow',
};

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

function cleanupFreeformValue(value: string | undefined, max = 80) {
  if (!value) return '';
  return value
    .trim()
    .replace(/^[\s:,-]+/, '')
    .replace(/[.!?;,:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max)
    .trim();
}

function cleanupPersonName(value: string | undefined) {
  const cleaned = cleanupFreeformValue(value, 40);
  if (!cleaned) return '';
  if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ' -]{1,39}$/.test(cleaned)) {
    return '';
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function compactSnippet(value: string, max = 120) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function isAffirmationOnly(value: string) {
  const text = normalize(value);
  return /^(oui|ok|okay|d accord|non|merci|vas y|go)$/.test(text);
}

function uniqueFacts(facts: MemoryFactDraft[]) {
  const map = new Map<string, MemoryFactDraft>();
  for (const fact of facts) {
    map.set(`${fact.layer}:${fact.key}`, fact);
  }
  return [...map.values()];
}

export function extractMemoryFactsFromText(
  userText: string,
): MemoryFactDraft[] {
  const text = userText.trim();
  if (!text) return [];

  const facts: MemoryFactDraft[] = [];
  const push = (fact: MemoryFactDraft | null) => {
    if (!fact?.value) return;
    facts.push(fact);
  };

  const namePatterns = [
    /\bje m['’]appelle\s+([a-zA-ZÀ-ÖØ-öø-ÿ' -]{2,40})\b/i,
    /\bmoi c['’]est\s+([a-zA-ZÀ-ÖØ-öø-ÿ' -]{2,40})\b/i,
    /\bappelle[- ]moi\s+([a-zA-ZÀ-ÖØ-öø-ÿ' -]{2,40})\b/i,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    const value = cleanupPersonName(match?.[1]);
    if (!value) continue;
    push({
      layer: 'identity',
      key: 'preferred_name',
      label: 'Prénom',
      value,
      confidence: 0.96,
      source: 'user.explicit',
    });
    break;
  }

  const projectName = cleanupFreeformValue(
    text.match(
      /\bmon projet s['’]appelle\s+(.+?)(?:,| et je | et mon |$)/i,
    )?.[1],
    80,
  );
  if (projectName) {
    push({
      layer: 'project',
      key: 'primary_project',
      label: 'Projet principal',
      value: projectName,
      confidence: 0.92,
      source: 'user.explicit',
    });
  }

  const company =
    cleanupFreeformValue(
      text.match(/\bje travaille chez\s+(.+?)(?:,| et |$)/i)?.[1],
      80,
    ) ||
    cleanupFreeformValue(
      text.match(/\bmon entreprise s['’]appelle\s+(.+?)(?:,| et |$)/i)?.[1],
      80,
    );
  if (company) {
    push({
      layer: 'identity',
      key: 'company',
      label: 'Entreprise',
      value: company,
      confidence: 0.88,
      source: 'user.explicit',
    });
  }

  const currentFocus = cleanupFreeformValue(
    text.match(/\bje travaille sur\s+(.+)/i)?.[1],
    100,
  );
  if (currentFocus) {
    push({
      layer: 'project',
      key: 'current_focus',
      label: 'Focus actuel',
      value: currentFocus,
      confidence: 0.84,
      source: 'user.explicit',
    });
  }

  const manager = cleanupPersonName(
    text.match(
      /\bmon manager s['’]appelle\s+([a-zA-ZÀ-ÖØ-öø-ÿ' -]{2,40})\b/i,
    )?.[1],
  );
  if (manager) {
    push({
      layer: 'relationship',
      key: 'manager',
      label: 'Manager',
      value: manager,
      confidence: 0.86,
      source: 'user.explicit',
    });
  }

  const client = cleanupFreeformValue(
    text.match(/\bmon client principal est\s+(.+)/i)?.[1],
    80,
  );
  if (client) {
    push({
      layer: 'relationship',
      key: 'primary_client',
      label: 'Client principal',
      value: client,
      confidence: 0.82,
      source: 'user.explicit',
    });
  }

  const responseStyleMatch = normalize(text).match(
    /\bje prefere(?: les)? reponses?\s+(courtes|breves|brief|detaillees|detaillee|normales|standard)\b/,
  );
  if (responseStyleMatch?.[1]) {
    const raw = responseStyleMatch[1];
    const value =
      raw === 'courtes' || raw === 'breves' || raw === 'brief'
        ? 'Réponses courtes'
        : raw === 'detaillees' || raw === 'detaillee'
          ? 'Réponses détaillées'
          : 'Réponses normales';
    push({
      layer: 'preference',
      key: 'response_style',
      label: 'Style de réponse',
      value,
      confidence: 0.84,
      source: 'user.explicit',
    });
  }

  const speechModeText = normalize(text);
  if (
    /\b(vouvoie moi|vouvoyez moi|on peut se vouvoyer|vouvoiement)\b/.test(
      speechModeText,
    )
  ) {
    push({
      layer: 'preference',
      key: 'speech_mode',
      label: "Mode d'adresse",
      value: 'Vouvoiement',
      confidence: 0.9,
      source: 'user.explicit',
    });
  } else if (
    /\b(tutoie moi|tu peux me tutoyer|on peut se tutoyer|tutoiement)\b/.test(
      speechModeText,
    )
  ) {
    push({
      layer: 'preference',
      key: 'speech_mode',
      label: "Mode d'adresse",
      value: 'Tutoiement',
      confidence: 0.9,
      source: 'user.explicit',
    });
  }

  const workflowRule = cleanupFreeformValue(
    text.match(/\bquand je te demande\s+(.+)/i)?.[1],
    110,
  );
  if (workflowRule) {
    push({
      layer: 'workflow',
      key: 'interaction_rule',
      label: "Règle d'interaction",
      value: workflowRule,
      confidence: 0.72,
      source: 'user.inferred',
    });
  }

  return uniqueFacts(facts);
}

export function buildSessionSummaryFromTurns(
  turns: SessionSummaryTurn[],
): { summary: string; highlights: string[] } | null {
  const recentTurns = turns.slice(-6);
  if (!recentTurns.length) return null;

  const highlights: string[] = [];

  const latestMeaningfulUser = [...recentTurns]
    .reverse()
    .find((turn) => !isAffirmationOnly(turn.userText) && turn.userText.trim());
  if (latestMeaningfulUser) {
    highlights.push(
      `Dernière demande notable: ${compactSnippet(latestMeaningfulUser.userText, 110)}`,
    );
  }

  const recentTools = [...recentTurns]
    .reverse()
    .filter((turn) => !!turn.toolName)
    .map((turn) => turn.toolName as string)
    .filter((tool, index, list) => list.indexOf(tool) === index)
    .slice(0, 3);
  if (recentTools.length) {
    highlights.push(`Actions récentes: ${recentTools.join(', ')}`);
  }

  const pendingQuestion = [...recentTurns]
    .reverse()
    .find((turn) => turn.kind === 'ask' && turn.assistantText.trim());
  if (pendingQuestion) {
    highlights.push(
      `Point en attente: ${compactSnippet(pendingQuestion.assistantText, 110)}`,
    );
  } else {
    const latestAssistant = [...recentTurns]
      .reverse()
      .find((turn) => turn.assistantText.trim());
    if (latestAssistant) {
      highlights.push(
        `Dernier résultat visible: ${compactSnippet(latestAssistant.assistantText, 110)}`,
      );
    }
  }

  const summary = highlights
    .map((line) => `- ${line}`)
    .join('\n')
    .trim();
  return summary ? { summary, highlights } : null;
}

@Injectable()
export class JarvisMemoryService {
  private readonly logger = new Logger(JarvisMemoryService.name);
  private readonly promptFactsPerLayer: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = Number(
      this.config.get('JARVIS_WORLD_MODEL_FACTS_PER_LAYER') ?? 2,
    );
    this.promptFactsPerLayer =
      Number.isFinite(raw) && raw > 0 ? Math.min(4, Math.floor(raw)) : 2;
  }

  async rememberFromUserText(sessionId: string, userText: string) {
    const facts = extractMemoryFactsFromText(userText);
    if (!facts.length) return;

    try {
      await Promise.all(
        facts.map((fact) =>
          this.prisma.jarvisMemoryFact.upsert({
            where: {
              sessionId_layer_key: {
                sessionId,
                layer: fact.layer,
                key: fact.key,
              },
            },
            create: {
              sessionId,
              layer: fact.layer,
              key: fact.key,
              label: fact.label,
              value: fact.value,
              confidence: fact.confidence,
              source: fact.source,
            },
            update: {
              label: fact.label,
              value: fact.value,
              confidence: fact.confidence,
              source: fact.source,
              lastSeenAt: new Date(),
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Impossible de persister la mémoire utilisateur pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private normalizeKey(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_:-]/g, '')
      .slice(0, 60);
  }

  private clampConfidence(value: unknown) {
    const raw = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(raw)) return null;
    return Math.min(1, Math.max(0, raw));
  }

  async listFacts(
    sessionId: string,
    options?: { layer?: MemoryLayer; limit?: number },
  ): Promise<MemoryFactItem[]> {
    const take = Math.min(Math.max(options?.limit ?? 25, 1), 50);

    try {
      const rows = await this.prisma.jarvisMemoryFact.findMany({
        where: {
          sessionId,
          ...(options?.layer ? { layer: options.layer } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          layer: true,
          key: true,
          label: true,
          value: true,
          confidence: true,
          source: true,
          updatedAt: true,
        },
      });

      return rows
        .filter((row) => MEMORY_LAYERS.includes(row.layer as MemoryLayer))
        .map((row) => ({
          layer: row.layer as MemoryLayer,
          key: row.key,
          label: row.label,
          value: row.value,
          confidence: row.confidence,
          source: row.source,
          updatedAt: row.updatedAt.toISOString(),
        }));
    } catch (error) {
      this.logger.warn(
        `Impossible de lister la mémoire utilisateur pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async searchFacts(
    sessionId: string,
    query: string,
    options?: { limit?: number },
  ): Promise<MemoryFactItem[]> {
    const q = query.trim();
    if (!q) return [];
    const take = Math.min(Math.max(options?.limit ?? 10, 1), 25);

    try {
      const rows = await this.prisma.jarvisMemoryFact.findMany({
        where: {
          sessionId,
          OR: [
            { key: { contains: q, mode: 'insensitive' } },
            { label: { contains: q, mode: 'insensitive' } },
            { value: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          layer: true,
          key: true,
          label: true,
          value: true,
          confidence: true,
          source: true,
          updatedAt: true,
        },
      });

      return rows
        .filter((row) => MEMORY_LAYERS.includes(row.layer as MemoryLayer))
        .map((row) => ({
          layer: row.layer as MemoryLayer,
          key: row.key,
          label: row.label,
          value: row.value,
          confidence: row.confidence,
          source: row.source,
          updatedAt: row.updatedAt.toISOString(),
        }));
    } catch (error) {
      this.logger.warn(
        `Impossible de rechercher dans la mémoire utilisateur pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async upsertFact(
    sessionId: string,
    input: {
      layer: MemoryLayer;
      key: string;
      label: string;
      value: string;
      confidence?: number;
      source?: string;
    },
  ): Promise<MemoryFactItem | null> {
    const layer = input.layer;
    if (!MEMORY_LAYERS.includes(layer)) return null;

    const key = this.normalizeKey(input.key);
    if (!key) return null;

    const label = input.label.trim().slice(0, 60);
    const value = input.value.trim().slice(0, 200);
    if (!label || !value) return null;

    const confidence = this.clampConfidence(input.confidence) ?? 0.8;
    const source = input.source?.trim().slice(0, 60) || 'user.explicit';

    try {
      const row = await this.prisma.jarvisMemoryFact.upsert({
        where: {
          sessionId_layer_key: {
            sessionId,
            layer,
            key,
          },
        },
        create: {
          sessionId,
          layer,
          key,
          label,
          value,
          confidence,
          source,
        },
        update: {
          label,
          value,
          confidence,
          source,
          lastSeenAt: new Date(),
        },
        select: {
          layer: true,
          key: true,
          label: true,
          value: true,
          confidence: true,
          source: true,
          updatedAt: true,
        },
      });

      return {
        layer: row.layer as MemoryLayer,
        key: row.key,
        label: row.label,
        value: row.value,
        confidence: row.confidence,
        source: row.source,
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `Impossible d'upsert un fait mémoire pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async forgetFact(
    sessionId: string,
    input: { layer: MemoryLayer; key: string },
  ): Promise<boolean> {
    const layer = input.layer;
    if (!MEMORY_LAYERS.includes(layer)) return false;
    const key = this.normalizeKey(input.key);
    if (!key) return false;

    try {
      const deleted = await this.prisma.jarvisMemoryFact.deleteMany({
        where: {
          sessionId,
          layer,
          key,
        },
      });
      return deleted.count > 0;
    } catch (error) {
      this.logger.warn(
        `Impossible d'oublier un fait mémoire pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async refreshSessionSummary(sessionId: string, turns: SessionSummaryTurn[]) {
    const next = buildSessionSummaryFromTurns(turns);
    if (!next) return;

    try {
      await this.prisma.jarvisSessionSummary.upsert({
        where: { sessionId },
        create: {
          sessionId,
          summary: next.summary,
          highlightsJson: JSON.stringify(next.highlights),
        },
        update: {
          summary: next.summary,
          highlightsJson: JSON.stringify(next.highlights),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible de persister le résumé de session pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getSnapshot(sessionId: string): Promise<JarvisWorldModelSnapshot> {
    try {
      const [facts, summary] = await Promise.all([
        this.prisma.jarvisMemoryFact.findMany({
          where: { sessionId },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: {
            layer: true,
            key: true,
            label: true,
            value: true,
            confidence: true,
            source: true,
            updatedAt: true,
          },
        }),
        this.prisma.jarvisSessionSummary.findUnique({
          where: { sessionId },
          select: {
            summary: true,
            highlightsJson: true,
            updatedAt: true,
          },
        }),
      ]);

      const factsByLayer = MEMORY_LAYERS.reduce(
        (acc, layer) => {
          acc[layer] = [];
          return acc;
        },
        {} as Record<MemoryLayer, MemoryFactItem[]>,
      );

      for (const row of facts) {
        if (!MEMORY_LAYERS.includes(row.layer as MemoryLayer)) continue;
        factsByLayer[row.layer as MemoryLayer].push({
          layer: row.layer as MemoryLayer,
          key: row.key,
          label: row.label,
          value: row.value,
          confidence: row.confidence,
          source: row.source,
          updatedAt: row.updatedAt.toISOString(),
        });
      }

      return {
        factsByLayer,
        sessionSummary: summary
          ? {
              summary: summary.summary,
              highlights: parseHighlights(summary.highlightsJson),
              updatedAt: summary.updatedAt.toISOString(),
            }
          : null,
      };
    } catch (error) {
      this.logger.warn(
        `Impossible de lire le monde personnel pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        factsByLayer: MEMORY_LAYERS.reduce(
          (acc, layer) => {
            acc[layer] = [];
            return acc;
          },
          {} as Record<MemoryLayer, MemoryFactItem[]>,
        ),
        sessionSummary: null,
      };
    }
  }

  async buildPromptContext(sessionId: string) {
    const snapshot = await this.getSnapshot(sessionId);
    const lines: string[] = [];

    const factLines = MEMORY_LAYERS.map((layer) => {
      const items = snapshot.factsByLayer[layer].slice(
        0,
        this.promptFactsPerLayer,
      );
      if (!items.length) return '';
      return `- ${LAYER_LABELS[layer]}: ${items
        .map((item) => `${item.label} = ${item.value}`)
        .join(' | ')}`;
    }).filter(Boolean);

    if (factLines.length) {
      lines.push('Monde personnel persistant:');
      lines.push(...factLines);
    }

    if (snapshot.sessionSummary?.summary) {
      lines.push('Résumé persistant de session:');
      lines.push(snapshot.sessionSummary.summary);
    }

    return lines.join('\n').trim();
  }
}

function parseHighlights(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
