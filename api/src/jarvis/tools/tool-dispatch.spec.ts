import { DEFERRED_CAPABILITY_MESSAGE } from './beta-capabilities';
import { defineTool } from './define-tool';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { runTool, type ToolContext } from './tools';

function ctxWith(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    prisma: {},
    tz: 'Europe/Paris',
    sessionId: 'dispatch',
    ...overrides,
  } as unknown as ToolContext;
}

function register(
  handler: Parameters<typeof defineTool<'todo.list'>>[0]['handler'],
) {
  (TOOL_DEFINITIONS as Record<string, unknown>)['todo.list'] = defineTool({
    name: 'todo.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'none',
    deferred: false,
    handler,
  });
}

describe('registry dispatch', () => {
  afterEach(() => {
    delete (TOOL_DEFINITIONS as Record<string, unknown>)['todo.list'];
  });

  it('runs a registered handler with the built environment', async () => {
    register((env) => Promise.resolve(`handled:${env.sessionId}`));
    const out = await runTool(ctxWith(), {
      type: 'tool',
      name: 'todo.list',
      args: {},
    });
    expect(out).toBe('handled:dispatch');
  });

  it('short-circuits deferred tools before the registry or any resolver', async () => {
    const handler = jest.fn();
    (TOOL_DEFINITIONS as Record<string, unknown>)['habit.list'] = defineTool({
      name: 'habit.list',
      risk: 'low',
      requiresConfirmation: false,
      sideEffect: false,
      requires: 'none',
      deferred: true,
      handler,
    });
    try {
      const out = await runTool(ctxWith(), {
        type: 'tool',
        name: 'habit.list',
        args: {},
      });
      expect(out).toBe(DEFERRED_CAPABILITY_MESSAGE);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      delete (TOOL_DEFINITIONS as Record<string, unknown>)['habit.list'];
    }
  });

  it('restricts todo selection to frozen local targets', async () => {
    let seen: unknown;
    register((env) => {
      seen = env.todoSelection;
      return Promise.resolve('ok');
    });
    await runTool(
      ctxWith({
        frozenLocalTargets: {
          kind: 'todo',
          items: [{ id: 't1', text: 'a', done: false }],
        },
      }),
      { type: 'tool', name: 'todo.list', args: {} },
    );
    expect(seen).toEqual({ id: { in: ['t1'] } });
  });
});
