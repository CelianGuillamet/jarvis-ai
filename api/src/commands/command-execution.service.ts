import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommandJournalService } from './command-journal.service';
import {
  executeWithPolicy,
  type MutationPolicyContext,
} from './execution-policy';

export type CommandExecution = {
  ownerId: string;
  conversationId: string;
  toolName: string;
  arguments: Prisma.InputJsonObject;
  targets: Prisma.InputJsonObject[];
  policy: MutationPolicyContext;
} & (
  | { source: 'chat' | 'inbox' }
  | { source: 'confirmation'; commandId: string }
);

/** Records intent before side effects; confirmation responses are finalized by their adapter. */
@Injectable()
export class CommandExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    input: CommandExecution,
    mutate: (commandId: string) => Promise<T>,
    simulate: () => T | Promise<T>,
  ): Promise<T> {
    input = {
      ...input,
      arguments: JSON.parse(
        JSON.stringify(input.arguments),
      ) as Prisma.InputJsonObject,
      targets: JSON.parse(
        JSON.stringify(input.targets),
      ) as Prisma.InputJsonObject[],
    };
    if (input.ownerId !== input.policy.ownerId)
      throw new ConflictException('Propriétaire de commande invalide.');
    return executeWithPolicy(
      input.policy,
      () => this.run(input, false, mutate),
      () => this.run(input, true, simulate),
    );
  }

  private async run<T>(
    input: CommandExecution,
    simulation: boolean,
    work: (commandId: string) => T | Promise<T>,
  ): Promise<T> {
    const id =
      input.source === 'confirmation'
        ? input.commandId
        : await this.prisma.$transaction(async (tx) => {
            const journal = new CommandJournalService(tx);
            const row = await journal.propose({
              ownerId: input.ownerId,
              conversationId: input.conversationId,
              requestId: randomUUID(),
              toolName: input.toolName,
              toolVersion: '1',
              source: input.source,
              arguments: input.arguments,
              targets: input.targets,
              expiresAt: new Date(Date.now() + 600000),
            });
            await journal.advance(input.ownerId, row.id, 0, 'waiting');
            await journal.approve(input.ownerId, row.id, 1, row.digest);
            await journal.advance(input.ownerId, row.id, 2, 'executing');
            return row.id;
          });
    const owned = await this.prisma.command.findFirst({
      where: {
        id,
        ownerId: input.ownerId,
        conversationId: input.conversationId,
        toolName: input.toolName,
        source: input.source,
        state: 'executing',
      },
      select: { id: true },
    });
    if (!owned) throw new ConflictException('Commande indisponible.');
    try {
      const result = await work(id);
      if (input.source !== 'confirmation') {
        const response = JSON.parse(
          JSON.stringify({
            text: typeof result === 'string' ? result : 'Action traitée.',
            result,
            meta: {
              simulation,
              sessionId: input.conversationId,
              commandId: id,
            },
          }),
        ) as Prisma.InputJsonObject;
        const updated = await this.prisma.command.updateMany({
          where: { id, ownerId: input.ownerId, state: 'executing' },
          data: {
            state: 'completed',
            outcomeCode: simulation ? 'SIMULATED' : 'TOOL_RETURNED',
            response,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ConflictException('Résultat de commande non enregistré.');
      }
      return result;
    } catch (error) {
      // An unavailable database can leave executing intent; never retry the effect.
      await this.prisma.command
        .updateMany({
          where: { id, ownerId: input.ownerId, state: 'executing' },
          data: {
            state: 'unknown',
            outcomeCode: 'EXECUTION_UNCERTAIN',
            revision: { increment: 1 },
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
