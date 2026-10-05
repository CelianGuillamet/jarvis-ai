import { PrismaService } from '../../src/prisma/prisma.service';
import { TodayReadService } from '../../src/today/today-read.service';
import { TodayQuerySchema } from '../../src/contracts/v1';

describe('Bounded owner-scoped Today pages', () => {
  const prisma = new PrismaService();
  const ownerId = 'today-pages';
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [ownerId, 'today-pages-foreign'])
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.invalid` },
      });
    await prisma.todo.createMany({
      data: Array.from({ length: 61 }, (_, index) => ({
        ownerId,
        text: `Task ${index}`,
        createdAt: new Date('2026-10-05T12:00:00Z'),
      })),
    });
    await prisma.note.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        ownerId,
        text: `Note ${index}`,
      })),
    });
    await prisma.todo.create({
      data: { ownerId: 'today-pages-foreign', text: 'Foreign' },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('returns independent stable pages and no foreign data', async () => {
    const service = new TodayReadService(prisma);
    const first = await service.snapshot(ownerId);
    const tasks = await service.snapshot(ownerId, {
      taskOffset: 50,
      noteOffset: 0,
    });
    const notes = await service.snapshot(ownerId, {
      taskOffset: 0,
      noteOffset: 50,
    });
    expect(first.tasks).toHaveLength(50);
    expect(first.notes).toHaveLength(50);
    expect(first.tasksHasMore).toBe(true);
    expect(first.notesHasMore).toBe(true);
    expect(tasks.tasks).toHaveLength(11);
    expect(tasks.tasksHasMore).toBe(false);
    expect(notes.notes).toHaveLength(5);
    expect(notes.notesHasMore).toBe(false);
    expect(
      new Set([...first.tasks, ...tasks.tasks].map((row) => row.id)).size,
    ).toBe(61);
    expect(
      new Set([...first.notes, ...notes.notes].map((row) => row.id)).size,
    ).toBe(55);
    expect(tasks.notes).toEqual(first.notes);
    expect(notes.tasks).toEqual(first.tasks);
    expect(first.tasks.some((row) => row.text === 'Foreign')).toBe(false);
  });
  it('rejects unbounded or invalid paging before querying', () => {
    for (const taskOffset of [-1, 1.5, 10001, 'invalid'])
      expect(TodayQuerySchema.safeParse({ taskOffset }).success).toBe(false);
    expect(
      TodayQuerySchema.parse({ taskOffset: '50', noteOffset: '0' }),
    ).toMatchObject({ taskOffset: 50, noteOffset: 0 });
  });
});
