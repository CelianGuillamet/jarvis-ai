import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TodayLocalSnapshotSchema,
  type TodayLocalSnapshot,
} from '../contracts/v1';
import { dataUnavailable } from '../http/data-unavailable';

/** Bounded account data. Read failures never masquerade as empty lists. */
@Injectable()
export class TodayReadService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(ownerId: string): Promise<TodayLocalSnapshot> {
    try {
      const [tasks, notes] = await this.prisma.$transaction([
        this.prisma.todo.findMany({
          where: { ownerId },
          orderBy: [{ done: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: 51,
          select: {
            id: true,
            text: true,
            done: true,
            doneAt: true,
            createdAt: true,
          },
        }),
        this.prisma.note.findMany({
          where: { ownerId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 51,
          select: { id: true, title: true, text: true, createdAt: true },
        }),
      ]);
      return TodayLocalSnapshotSchema.parse({
        fetchedAt: new Date().toISOString(),
        tasks: tasks.slice(0, 50).map((task) => ({
          ...task,
          createdAt: task.createdAt.toISOString(),
          doneAt: task.doneAt?.toISOString() ?? null,
        })),
        notes: notes.slice(0, 50).map((note) => ({
          ...note,
          createdAt: note.createdAt.toISOString(),
        })),
        tasksHasMore: tasks.length > 50,
        notesHasMore: notes.length > 50,
      });
    } catch {
      throw dataUnavailable();
    }
  }
}
