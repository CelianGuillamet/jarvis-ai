import { dataUnavailable } from '../../http/data-unavailable';
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

const MEMORY_LAYERS: MemoryLayer[] = [
  'identity',
  'preference',
  'project',
  'relationship',
  'workflow',
];

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
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
    } catch {
      this.logger.warn('Impossible de persister le resume de session.');
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
    } catch {
      this.logger.warn('Impossible de lire le monde personnel.');
      throw dataUnavailable();
    }
  }

  // Legacy inferred facts are no longer prompt context; approved PersonalFact rows are (JAR-049).
  async buildPromptContext(sessionId: string) {
    const snapshot = await this.getSnapshot(sessionId);
    if (!snapshot.sessionSummary?.summary) return '';
    return `Résumé persistant de session:\n${snapshot.sessionSummary.summary}`;
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
