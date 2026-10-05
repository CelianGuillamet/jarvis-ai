import { AccountExportController } from './account-export.controller';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './session.guard';
import {
  AccountDataExportQuerySchema,
  AccountDataExportPageSchema,
} from '../contracts/v1';

const request = {
  identity: { userId: 'signed-owner' },
} as AuthenticatedRequest;
describe('Owner-scoped paged data export', () => {
  it('bounds the page, projects fields and binds every cursor read to the signed-in owner', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      title: null,
      text: 'Fixture note',
      createdAt: new Date('2026-10-05T12:00:00Z'),
    }));
    const findMany = jest.fn().mockResolvedValue(rows);
    const controller = new AccountExportController({
      note: { findMany },
    } as unknown as PrismaService);
    const after = '00000000-0000-4000-8000-000000000000';
    const result = await controller.page(request, {
      collection: 'notes',
      after,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { ownerId: 'signed-owner', id: { gt: after } },
      orderBy: { id: 'asc' },
      take: 51,
      select: { id: true, title: true, text: true, createdAt: true },
    });
    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe(rows[49].id);
    expect(AccountDataExportPageSchema.safeParse(result).success).toBe(true);
  });
  it.each([
    { collection: 'tokens' },
    { collection: 'notes', ownerId: 'another-owner' },
    { collection: 'notes', after: 'arbitrary-sql' },
  ])(
    'rejects unsupported resources and untrusted scope/cursors %j',
    (input) => {
      expect(AccountDataExportQuerySchema.safeParse(input).success).toBe(false);
    },
  );
});
