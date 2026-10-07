import type { ToolHandlerEnv } from '../define-tool';
import { getLastTodoList, withLocalToolCaches } from '../support/tool-caches';
import { todoTools } from './todo';

function envWith(prisma: unknown, recordUndo = jest.fn()): ToolHandlerEnv {
  return {
    ctx: { recordUndo },
    prisma,
    tz: 'Europe/Paris',
    sessionId: 'todo-defs',
    todoSelection: {},
    shoppingSelection: {},
    resolvers: {},
  } as unknown as ToolHandlerEnv;
}

function definition(name: string) {
  const found = todoTools.find((tool) => tool.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found as unknown as {
    handler: (env: ToolHandlerEnv, call: unknown) => Promise<string>;
  };
}

describe('todo definitions', () => {
  it('todo.add creates an owned todo and records an undo', async () => {
    const create = jest.fn().mockResolvedValue({ id: 't1' });
    const recordUndo = jest.fn();
    const env = envWith({ ownerId: 'u1', todo: { create } }, recordUndo);
    const out = await definition('todo.add').handler(env, {
      type: 'tool',
      name: 'todo.add',
      args: { text: 'Acheter du pain' },
    });
    expect(create).toHaveBeenCalledWith({
      data: { ownerId: 'u1', text: 'Acheter du pain' },
      select: { id: true },
    });
    expect(recordUndo).toHaveBeenCalledWith('ajout todo', true, [
      { kind: 'todo.delete', id: 't1' },
    ]);
    expect(out).toBe('OK. Ajouté: "Acheter du pain"');
  });

  it('todo.list numbers open todos and remembers the list for #N refs', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'a', text: 'Pain', done: false },
      { id: 'b', text: 'Lait', done: false },
    ]);
    const env = envWith({ todo: { findMany } });
    await withLocalToolCaches('todo-defs', async () => {
      const out = await definition('todo.list').handler(env, {
        type: 'tool',
        name: 'todo.list',
        args: {},
      });
      expect(out).toBe('Todos (open):\n- #1 - Pain\n- #2 - Lait');
      expect(getLastTodoList('todo-defs').map((t) => t.id)).toEqual(['a', 'b']);
    });
  });

  it('todo.list reports an empty list', async () => {
    const env = envWith({
      todo: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const out = await definition('todo.list').handler(env, {
      type: 'tool',
      name: 'todo.list',
      args: {},
    });
    expect(out).toBe('Aucun todo.');
  });
});
