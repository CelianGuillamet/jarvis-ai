import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  RoutineStepSchema,
  type RoutineList,
  type RoutineResumeRequest,
  type RoutineRun,
} from '../contracts/v1';
import { PrismaService } from '../prisma/prisma.service';
import {
  ROUTINES,
  validateRoutine,
  type RoutineDefinition,
} from './routine-definitions';
import {
  ROUTINE_STEP_RUNNER,
  type RoutineStepRunner,
} from './routine-step-runner';

type Step = z.infer<typeof RoutineStepSchema>;
const StepsSchema = z.array(RoutineStepSchema);
const MAX_ATTEMPTS = 5;
/** A step marked executing this recently belongs to a live caller; older means a crashed one. */
const STEP_LEASE_MS = 30_000;
export const ROUTINE_LEASE_MS = Symbol('ROUTINE_LEASE_MS');
const bound = (text: string | undefined, max: number) =>
  text === undefined ? null : text.slice(0, max);

type Row = {
  id: string;
  ownerId: string;
  conversationId: string;
  routineKey: string;
  requestId: string;
  state: string;
  steps: Prisma.JsonValue;
  result: string | null;
  cancelRequested: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class RoutineService {
  private readonly calls = new Map<
    string,
    ReturnType<typeof validateRoutine>
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROUTINE_STEP_RUNNER) private readonly runner: RoutineStepRunner,
    @Optional()
    @Inject(ROUTINE_LEASE_MS)
    private readonly leaseMs: number = STEP_LEASE_MS,
  ) {
    for (const routine of ROUTINES)
      this.calls.set(routine.key, validateRoutine(routine));
  }

  async list(ownerId: string): Promise<RoutineList> {
    const [settings, runs] = await Promise.all([
      this.prisma.routineSetting.findMany({ where: { ownerId } }),
      this.prisma.routineRun.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const disabled = new Set(
      settings.filter((s) => !s.enabled).map((s) => s.routineKey),
    );
    return {
      routines: ROUTINES.map((routine) => ({
        key: routine.key,
        title: routine.title,
        description: routine.description,
        enabled: !disabled.has(routine.key),
        steps: routine.steps.map((step) => ({
          id: step.id,
          tool: step.tool,
          optional: !!step.optional,
          effect: 'read-only' as const,
        })),
      })),
      runs: runs.map((row) => this.serialize(row)),
    };
  }

  async setEnabled(ownerId: string, key: string, enabled: boolean) {
    this.definition(key);
    await this.prisma.routineSetting.upsert({
      where: { ownerId_routineKey: { ownerId, routineKey: key } },
      create: { ownerId, routineKey: key, enabled },
      update: { enabled },
    });
    return this.list(ownerId);
  }

  async start(
    ownerId: string,
    conversationId: string,
    key: string,
    requestId: string,
  ): Promise<RoutineRun> {
    const definition = this.definition(key);
    const existing = await this.prisma.routineRun.findUnique({
      where: { ownerId_requestId: { ownerId, requestId } },
    });
    if (existing) {
      if (
        existing.routineKey !== key ||
        existing.conversationId !== conversationId
      )
        throw new ConflictException('Cette requête désigne une autre routine.');
      return this.advance(ownerId, existing.id);
    }
    const setting = await this.prisma.routineSetting.findUnique({
      where: { ownerId_routineKey: { ownerId, routineKey: key } },
    });
    if (setting && !setting.enabled)
      throw new ConflictException('Cette routine est désactivée.');
    const steps: Step[] = definition.steps.map((step) => ({
      id: step.id,
      tool: step.tool,
      optional: !!step.optional,
      state: 'pending',
      attempt: 1,
      commandId: null,
      text: null,
      evidence: null,
    }));
    let created: Row;
    try {
      created = await this.prisma.routineRun.create({
        data: {
          ownerId,
          conversationId,
          routineKey: key,
          requestId,
          state: 'running',
          steps,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const raced = await this.prisma.routineRun.findUniqueOrThrow({
        where: { ownerId_requestId: { ownerId, requestId } },
      });
      return this.advance(ownerId, raced.id);
    }
    return this.advance(ownerId, created.id);
  }

  async cancel(ownerId: string, runId: string): Promise<RoutineRun> {
    const row = await this.load(ownerId, runId);
    if (row.state !== 'running' && row.state !== 'suspended')
      return this.serialize(row);
    await this.prisma.routineRun.updateMany({
      where: { id: runId, ownerId },
      data: { cancelRequested: true },
    });
    return this.advance(ownerId, runId);
  }

  async resume(
    ownerId: string,
    runId: string,
    input: RoutineResumeRequest,
  ): Promise<RoutineRun> {
    const row = await this.load(ownerId, runId);
    const steps = this.steps(row);
    const target = steps.find((step) => step.id === input.stepId);
    if (row.state !== 'suspended' || target?.state !== 'unknown')
      throw new ConflictException(
        'Cette étape n’attend pas de décision de reprise.',
      );
    if (input.resolution === 'retry' && target.attempt >= MAX_ATTEMPTS)
      throw new ConflictException('Nombre maximal de tentatives atteint.');
    const next = steps.map((step) => {
      if (step.id === target.id)
        return input.resolution === 'retry'
          ? {
              ...step,
              state: 'pending' as const,
              attempt: step.attempt + 1,
              commandId: null,
              text: null,
              evidence: input.evidence,
            }
          : { ...step, state: 'skipped' as const, evidence: input.evidence };
      return step.state === 'blocked'
        ? { ...step, state: 'pending' as const }
        : step;
    });
    const saved = await this.save(row, { steps: next, state: 'running' });
    if (!saved) throw new ConflictException('La routine a changé. Réessayez.');
    return this.advance(ownerId, runId);
  }

  async advance(ownerId: string, runId: string): Promise<RoutineRun> {
    for (;;) {
      const row = await this.load(ownerId, runId);
      const steps = this.steps(row);
      const calls = this.calls.get(row.routineKey)!;
      const definition = this.definition(row.routineKey);
      if (
        (row.state !== 'running' && row.state !== 'suspended') ||
        (row.state === 'suspended' && !row.cancelRequested)
      )
        return this.serialize(row);

      const inFlight = steps.some((step) => step.state === 'executing');
      if (inFlight && Date.now() - row.updatedAt.getTime() < this.leaseMs)
        return this.serialize(row);

      if (row.cancelRequested) {
        if (!inFlight) {
          const done = steps.filter((step) => step.state === 'completed');
          const closed = steps.map((step) =>
            step.state === 'pending' || step.state === 'blocked'
              ? { ...step, state: 'cancelled' as const }
              : step,
          );
          await this.save(row, {
            steps: closed,
            state: 'cancelled',
            result: `Annulée après ${done.length} étape(s) terminée(s). Toutes les étapes sont en lecture seule : aucun effet à annuler.`,
          });
          continue;
        }
      }

      const index = steps.findIndex(
        (step) => step.state === 'pending' || step.state === 'executing',
      );
      if (index < 0) {
        const failed = steps.some((step) => step.state === 'failed');
        await this.save(row, {
          steps,
          state: failed ? 'failed' : 'completed',
          result: failed ? null : this.compose(definition, steps),
        });
        continue;
      }

      let step = steps[index];
      if (step.state === 'pending') {
        step = { ...step, state: 'executing' };
        const claimed = steps.map((s, i) => (i === index ? step : s));
        if (!(await this.save(row, { steps: claimed })))
          return this.serialize(await this.load(ownerId, runId));
      }

      const outcome = await this.runner.runRoutineStep({
        ownerId,
        conversationId: row.conversationId,
        requestId: `${row.id}:${step.id}:${step.attempt}`,
        call: calls[index],
      });

      const fresh = await this.load(ownerId, runId);
      const current = this.steps(fresh);
      const settled = current.map((s): Step => {
        if (s.id !== step.id) return s;
        const base = {
          ...s,
          commandId: outcome.commandId ?? s.commandId,
          text: bound(outcome.text, 2000),
        };
        if (outcome.state === 'completed')
          return { ...base, state: 'completed' };
        if (outcome.state === 'failed')
          return { ...base, state: s.optional ? 'skipped' : 'failed' };
        return { ...base, state: 'unknown' };
      });
      const halted = settled.find(
        (s) => s.state === 'unknown' || (s.state === 'failed' && !s.optional),
      );
      const next = halted
        ? settled.map((s) =>
            s.state === 'pending' ? { ...s, state: 'blocked' as const } : s,
          )
        : settled;
      await this.save(fresh, {
        steps: next,
        ...(halted
          ? { state: halted.state === 'unknown' ? 'suspended' : 'failed' }
          : {}),
      });
    }
  }

  private definition(key: string): RoutineDefinition {
    const found = ROUTINES.find((routine) => routine.key === key);
    if (!found) throw new NotFoundException('Routine introuvable.');
    return found;
  }

  private async load(ownerId: string, runId: string): Promise<Row> {
    const row = await this.prisma.routineRun.findFirst({
      where: { id: runId, ownerId },
    });
    if (!row) throw new NotFoundException('Exécution introuvable.');
    return row;
  }

  private steps(row: Row): Step[] {
    return StepsSchema.parse(row.steps);
  }

  private async save(
    row: Row,
    change: { steps: Step[]; state?: string; result?: string | null },
  ): Promise<boolean> {
    const updated = await this.prisma.routineRun.updateMany({
      where: { id: row.id, ownerId: row.ownerId, revision: row.revision },
      data: {
        steps: change.steps,
        ...(change.state ? { state: change.state } : {}),
        ...(change.result !== undefined ? { result: change.result } : {}),
        revision: { increment: 1 },
      },
    });
    return updated.count === 1;
  }

  private compose(definition: RoutineDefinition, steps: Step[]): string {
    return definition.steps
      .map((def) => {
        const step = steps.find((s) => s.id === def.id);
        return step?.state === 'completed' && step.text
          ? `${def.label}\n${step.text}`
          : null;
      })
      .filter((section): section is string => section !== null)
      .join('\n\n')
      .slice(0, 8000);
  }

  private serialize(row: Row): RoutineRun {
    return {
      id: row.id,
      routineKey: row.routineKey,
      state: row.state as RoutineRun['state'],
      steps: this.steps(row),
      result: row.result,
      cancelRequested: row.cancelRequested,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
