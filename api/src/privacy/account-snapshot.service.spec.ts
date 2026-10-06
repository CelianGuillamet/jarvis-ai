import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  AccountSnapshotService,
  redactExportValue,
} from './account-snapshot.service';
import { EXPORT_PROJECTIONS } from './export-projections';
import { RETAINED_DATA_INVENTORY } from './data-inventory';

function fixture(commitError?: Error) {
  const tx = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'signed-owner' }),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const $transaction = jest.fn(
    async (run: (value: typeof tx) => Promise<void>) => {
      await run(tx);
      if (commitError) throw commitError;
    },
  );
  const service = new AccountSnapshotService({
    $transaction,
  } as unknown as PrismaService);
  return { service, tx, $transaction };
}

describe('Coherent account download', () => {
  it('includes an explicit projection for every retained table and never selects auth secrets', () => {
    expect(Object.keys(EXPORT_PROJECTIONS).sort()).toEqual(
      Object.keys(RETAINED_DATA_INVENTORY).sort(),
    );
    for (const [model, fields] of Object.entries(EXPORT_PROJECTIONS)) {
      const disposition =
        RETAINED_DATA_INVENTORY[model as keyof typeof RETAINED_DATA_INVENTORY]
          .export;
      expect(fields === null).toBe(disposition === 'excluded');
      for (const field of fields ?? []) {
        expect([
          'password',
          'token',
          'accessToken',
          'refreshToken',
          'idToken',
        ]).not.toContain(field);
      }
    }
  });

  it('redacts nested credentials including legacy JSON strings without dropping personal content', () => {
    expect(
      redactExportValue({
        note: 'Mes données',
        arguments: { access_token: 'secret', text: 'Bonjour' },
        payload: '[{"API_KEY":"secret","title":"Archive"}]',
        Cookie: 'session=secret',
      }),
    ).toEqual({
      note: 'Mes données',
      arguments: { text: 'Bonjour' },
      payload: '[{"title":"Archive"}]',
    });
    expect(redactExportValue('Texte non JSON')).toBe('Texte non JSON');
    expect(redactExportValue('[JSON incomplet')).toBe('[JSON incomplet');
  });

  it('preserves user-authored JSON text while redacting actual structured credential payloads', () => {
    const text =
      '{"password":"my saved note","accessToken":"user-authored text"}';
    expect(redactExportValue({ text, inputText: text, value: text })).toEqual({
      text,
      inputText: text,
      value: text,
    });
    const exported = redactExportValue({
      argsJson: JSON.stringify({ text, refreshToken: 'platform-secret' }),
    });
    expect(exported).toEqual({ argsJson: JSON.stringify({ text }) });
  });

  it('uses one repeatable-read transaction and parametrizes signed ownership for every table', async () => {
    const { service, tx, $transaction } = fixture();
    const write = jest.fn().mockResolvedValue(undefined);
    await service.stream('signed-owner', write, new AbortController().signal);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5000,
      timeout: 60000,
    });
    expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'signed-owner' },
      select: { id: true },
    });
    const declarations = tx.$executeRaw.mock.calls
      .map(([query]: [Prisma.Sql]) => query)
      .filter((query) => query.sql?.startsWith('DECLARE'));
    expect(declarations).toHaveLength(
      Object.values(EXPORT_PROJECTIONS).filter((fields) => fields !== null)
        .length,
    );
    for (const query of declarations) {
      expect(query.values).toContain('signed-owner');
      expect(query.sql).not.toContain('signed-owner');
    }
    expect(write.mock.calls.at(-1)).toEqual([{ type: 'complete', records: 0 }]);
  });

  it('awaits each emitted batch and sanitizes its records', async () => {
    const { service, tx } = fixture();
    let todoCursor = false;
    let emitted = false;
    tx.$executeRaw.mockImplementation((query: Prisma.Sql) => {
      if (query.sql?.startsWith('DECLARE')) {
        todoCursor = query.sql.includes('FROM "Todo"');
      }
      return Promise.resolve(0);
    });
    tx.$queryRaw.mockImplementation(() => {
      if (!todoCursor || emitted) return Promise.resolve([]);
      emitted = true;
      return Promise.resolve([
        { record: { text: 'Task', refreshToken: 'secret' } },
      ]);
    });
    const records: unknown[] = [];
    await service.stream(
      'signed-owner',
      (record) => {
        records.push(record);
        return Promise.resolve();
      },
      new AbortController().signal,
    );
    expect(records).toContainEqual({
      type: 'record',
      collection: 'Todo',
      data: { text: 'Task' },
    });
    expect(records.at(-1)).toEqual({ type: 'complete', records: 1 });
  });

  it('does not declare a complete download if commit fails', async () => {
    const { service } = fixture(new Error('Database unavailable'));
    const write = jest.fn().mockResolvedValue(undefined);
    await expect(
      service.stream('signed-owner', write, new AbortController().signal),
    ).rejects.toThrow('Database unavailable');
    expect(
      write.mock.calls.some(
        ([record]: [unknown]) =>
          (record as { type?: string }).type === 'complete',
      ),
    ).toBe(false);
  });

  it('rolls back when the client disconnects instead of continuing a background export', async () => {
    const { service, tx } = fixture();
    const controller = new AbortController();
    const write = jest.fn(() => {
      controller.abort();
      return Promise.resolve();
    });
    await expect(
      service.stream('signed-owner', write, controller.signal),
    ).rejects.toThrow('Export interrupted');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
