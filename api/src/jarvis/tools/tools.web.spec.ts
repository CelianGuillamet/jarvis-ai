import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

describe('runTool web tools', () => {
  function makeCtx(web: WebProvider): ToolContext {
    return {
      prisma: {} as any,
      memory: {} as any,
      simulation: false,
      tz: 'Europe/Paris',
      sessionId: 'web-tools-spec',
      calendar: {} as CalendarProvider,
      web,
      weather: {} as any,
      gmail: {} as GmailProvider,
    };
  }

  it('formats web.search results', async () => {
    const web: WebProvider = {
      name: 'mock',
      async search() {
        return [
          {
            title: 'OpenAI',
            url: 'https://openai.com',
            snippet: 'AI tools and research.',
          },
        ];
      },
      async open(url: string) {
        return { url, content: '' };
      },
    };
    const out = await runTool(makeCtx(web), {
      type: 'tool',
      name: 'web.search',
      args: { query: 'openai', limit: 5 },
    });
    expect(out).toContain('web');
    expect(out).toContain('https://openai.com');
  });

  it('renders web.open result', async () => {
    const web: WebProvider = {
      name: 'mock',
      async search() {
        return [];
      },
      async open(url: string) {
        return {
          url,
          title: 'Titre test',
          content: 'Contenu test',
        };
      },
    };
    const out = await runTool(makeCtx(web), {
      type: 'tool',
      name: 'web.open',
      args: { url: 'https://example.com' },
    });
    expect(out).toContain('Titre: Titre test');
    expect(out).toContain('Contenu test');
  });
});
