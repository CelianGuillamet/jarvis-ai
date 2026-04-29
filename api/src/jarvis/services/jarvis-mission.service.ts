import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type MissionRecord = {
  id: string;
  objective: string;
  horizon: string | null;
  status: string;
  summary: string;
  nextStep: string | null;
  keySignals: string[];
  updatedAt: string;
};

const MISSION_SECTION_TITLES = [
  'Evaluation tactique',
  'Signaux pertinents',
  'Plan recommande',
  'Risques',
  'Commandes suggerees',
] as const;

function normalizeObjective(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim();
}

function parseJsonArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function extractSectionLines(
  planText: string,
  header: (typeof MISSION_SECTION_TITLES)[number],
) {
  const lines = planText.split('\n').map((line) => line.trim());
  const start = lines.findIndex((line) => line === header);
  if (start < 0) return [];

  const out: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    if (
      MISSION_SECTION_TITLES.includes(
        line as (typeof MISSION_SECTION_TITLES)[number],
      )
    ) {
      break;
    }
    out.push(line);
  }
  return out;
}

export function parseMissionPlan(planText: string, objective: string) {
  const executiveLines = extractSectionLines(planText, 'Evaluation tactique');
  const signalLines = extractSectionLines(planText, 'Signaux pertinents')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
  const planLines = extractSectionLines(planText, 'Plan recommande');

  const summary =
    executiveLines[0]?.replace(/^-\s*/, '').trim() ||
    `Mission active autour de ${objective}.`;
  const nextStep =
    planLines
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .find(Boolean) ?? null;

  return {
    summary,
    nextStep,
    keySignals: signalLines.slice(0, 4),
  };
}

@Injectable()
export class JarvisMissionService {
  private readonly logger = new Logger(JarvisMissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordPlan(
    sessionId: string,
    input: { objective: string; horizon?: string },
    planText: string,
  ) {
    const objective = input.objective.trim();
    if (!objective) return null;

    const objectiveKey = normalizeObjective(objective);
    const parsed = parseMissionPlan(planText, objective);

    try {
      const existing = await this.prisma.jarvisMission.findFirst({
        where: {
          sessionId,
          objectiveKey,
          status: 'active',
        },
        select: { id: true },
      });

      if (existing) {
        return this.prisma.jarvisMission.update({
          where: { id: existing.id },
          data: {
            objective,
            horizon: input.horizon?.trim() || null,
            summary: parsed.summary,
            nextStep: parsed.nextStep,
            planText,
            keySignalsJson: JSON.stringify(parsed.keySignals),
          },
          select: { id: true },
        });
      }

      return this.prisma.jarvisMission.create({
        data: {
          sessionId,
          objective,
          objectiveKey,
          horizon: input.horizon?.trim() || null,
          summary: parsed.summary,
          nextStep: parsed.nextStep,
          planText,
          keySignalsJson: JSON.stringify(parsed.keySignals),
        },
        select: { id: true },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible de persister la mission pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async list(
    sessionId: string,
    options?: { status?: 'active' | 'all'; limit?: number },
  ): Promise<MissionRecord[]> {
    const take = Math.min(Math.max(options?.limit ?? 5, 1), 12);

    try {
      const rows = await this.prisma.jarvisMission.findMany({
        where: {
          sessionId,
          ...(options?.status === 'all' ? {} : { status: 'active' }),
        },
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true,
          objective: true,
          horizon: true,
          status: true,
          summary: true,
          nextStep: true,
          keySignalsJson: true,
          updatedAt: true,
        },
      });

      return rows.map((row) => ({
        id: row.id,
        objective: row.objective,
        horizon: row.horizon,
        status: row.status,
        summary: row.summary,
        nextStep: row.nextStep,
        keySignals: parseJsonArray(row.keySignalsJson),
        updatedAt: row.updatedAt.toISOString(),
      }));
    } catch (error) {
      this.logger.warn(
        `Impossible de lire les missions pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async buildPromptContext(sessionId: string) {
    const missions = await this.list(sessionId, { status: 'active', limit: 3 });
    if (!missions.length) return '';

    return [
      'Missions actives:',
      ...missions.map((mission) => {
        const horizon = mission.horizon ? ` (${mission.horizon})` : '';
        const nextStep = mission.nextStep
          ? ` | prochaine étape: ${mission.nextStep}`
          : '';
        return `- ${mission.objective}${horizon} | ${mission.summary}${nextStep}`;
      }),
    ].join('\n');
  }
}
