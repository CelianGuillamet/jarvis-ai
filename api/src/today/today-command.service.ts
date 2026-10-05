import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { CommandJournalService } from '../commands/command-journal.service';
import { CommandExecutionService } from '../commands/command-execution.service';
import type { MutationPolicyContext } from '../commands/execution-policy';
import type { ToolOnly } from '../jarvis/tools/tool-registry';

export type DirectOutcome = {
  commandId: string;
  state: 'completed' | 'executing' | 'unknown' | 'failed';
  text: string;
  simulation: boolean;
};

/** Serializes request claims, not effects. A claimed effect is never automatically retried. */
@Injectable()
export class TodayCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: CommandExecutionService,
  ) {}

  async execute(
    input: {
      ownerId: string;
      conversationId: string;
      requestId: string;
      call: ToolOnly;
      policy: MutationPolicyContext;
    },
    prepare: () => Promise<Prisma.InputJsonObject[]>,
    mutate: (commandId: string, targets: Prisma.JsonValue) => Promise<string>,
    simulate: () => string,
  ): Promise<DirectOutcome> {
    input = {
      ...input,
      call: structuredClone(input.call),
      policy: { ...input.policy, capabilities: [...input.policy.capabilities] },
    };
    if (input.ownerId !== input.policy.ownerId)
      throw new ConflictException('Propriétaire de commande invalide.');
    const args = JSON.parse(
      JSON.stringify(input.call.args),
    ) as Prisma.InputJsonObject;
    const claimed = await this.prisma.$transaction(async (tx) => {
      // Same account/request identity waits for the first claim to commit.
      // The lock is transaction-scoped and does not span domain execution.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.ownerId, input.requestId])}, 0))::text`;
      const existing = await tx.command.findUnique({
        where: {
          ownerId_requestId: {
            ownerId: input.ownerId,
            requestId: input.requestId,
          },
        },
      });
      if (existing) {
        if (
          existing.source !== 'direct' ||
          existing.conversationId !== input.conversationId ||
          existing.toolName !== input.call.name ||
          !isDeepStrictEqual(existing.arguments, args)
        )
          throw new ConflictException(
            'Cette requête désigne une autre action.',
          );
        return { row: existing, execute: false };
      }
      const targets = await prepare();
      const journal = new CommandJournalService(tx);
      const row = await journal.propose({
        ownerId: input.ownerId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        source: 'direct',
        toolName: input.call.name,
        toolVersion: '1',
        arguments: args,
        targets,
        expiresAt: new Date(Date.now() + 600000),
      });
      await journal.advance(input.ownerId, row.id, 0, 'waiting');
      await journal.approve(input.ownerId, row.id, 1, row.digest);
      await journal.advance(input.ownerId, row.id, 2, 'executing');
      return { row, execute: true };
    });
    const { row } = claimed;
    if (!claimed.execute) {
      if (row.state === 'completed') {
        const response = row.response;
        if (
          !response ||
          typeof response !== 'object' ||
          Array.isArray(response) ||
          typeof response.result !== 'string'
        )
          throw new ConflictException(
            'Résultat enregistré indisponible. Aucune action répétée.',
          );
        return {
          commandId: row.id,
          state: 'completed',
          text: response.result,
          simulation: row.outcomeCode === 'SIMULATED',
        };
      }
      const state =
        row.state === 'executing'
          ? 'executing'
          : row.state === 'failed'
            ? 'failed'
            : 'unknown';
      return {
        commandId: row.id,
        state,
        simulation: row.outcomeCode === 'SIMULATED',
        text: 'Cette action a déjà été prise en charge. Aucun effet répété ; vérifie son résultat dans les données.',
      };
    }
    const text = await this.executor.execute(
      {
        ownerId: input.ownerId,
        conversationId: input.conversationId,
        source: 'direct',
        commandId: row.id,
        toolName: input.call.name,
        arguments: args,
        targets: row.targets as Prisma.InputJsonObject[],
        policy: input.policy,
      },
      (commandId) => mutate(commandId, row.targets),
      simulate,
      () => 'completed',
    );
    return {
      commandId: row.id,
      state: 'completed',
      text,
      simulation: input.policy.simulation,
    };
  }
}
