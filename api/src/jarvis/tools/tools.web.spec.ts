import { WEB_DISABLED_MESSAGE } from '../providers/web.provider';
import { buildJarvisBaseSystemPrompt } from '../lib/system-prompt';
import { runTool, type ToolCall, type ToolContext } from './tools';

describe('disabled web tools', () => {
  it.each([false, true])(
    'rejects direct tool calls without invoking a provider (simulation=%s)',
    async (simulation) => {
      const web = {
        name: 'injected-provider',
        search: jest.fn(),
        open: jest.fn(),
      };
      const ctx = { simulation, web } as unknown as ToolContext;
      const calls: ToolCall[] = [
        { type: 'tool', name: 'web.search', args: { query: 'news' } },
        { type: 'tool', name: 'web.open', args: { url: 'http://[::1]' } },
      ];
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected fetch'));
      try {
        for (const call of calls) {
          expect(await runTool(ctx, call)).toBe(WEB_DISABLED_MESSAGE);
        }
        expect(web.search).not.toHaveBeenCalled();
        expect(web.open).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    },
  );

  it('does not advertise web tools in the model prompt', () => {
    const prompt = buildJarvisBaseSystemPrompt();
    expect(prompt).not.toContain('web.search');
    expect(prompt).not.toContain('web.open');
    expect(prompt).toContain('pages web sont désactivées');
  });
});
