import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type { GmailProvider } from '../../gmail/providers/gmail.provider';
import type { WebProvider } from '../providers/web.provider';
import type { WeatherProvider } from '../providers/weather.provider';
import { runTool, type ToolContext } from './tools';

describe('runTool weather tools', () => {
  function makeCtx(weather: WeatherProvider, memorySnapshot?: any): ToolContext {
    const web: WebProvider = {
      name: 'mock',
      async search() {
        return [];
      },
      async open(url: string) {
        return { url, content: '' };
      },
    };
    return {
      prisma: {} as any,
      memory: {
        getSnapshot: jest.fn().mockResolvedValue(
          memorySnapshot ?? {
            factsByLayer: {
              identity: [],
              preference: [],
              project: [],
              relationship: [],
              workflow: [],
            },
            sessionSummary: null,
          },
        ),
      } as any,
      simulation: false,
      tz: 'Europe/Paris',
      sessionId: 'weather-tools-spec',
      calendar: {} as CalendarProvider,
      web,
      weather,
      gmail: {} as GmailProvider,
    };
  }

  it('formats weather.forecast output', async () => {
    const weather: WeatherProvider = {
      name: 'mock',
      async getDailyForecast() {
        return {
          resolvedLocation: 'Lyon, France',
          timezone: 'Europe/Paris',
          day: {
            date: '2026-04-18',
            tempMinC: 7,
            tempMaxC: 16,
            precipitationProbMax: 10,
            windMaxKmh: 18,
            description: 'partiellement nuageux',
          },
          source: 'open-meteo',
        };
      },
    };

    const out = await runTool(makeCtx(weather), {
      type: 'tool',
      name: 'weather.forecast',
      args: { location: 'Lyon', day: 'tomorrow' },
    });

    expect(out).toContain('Demain');
    expect(out).toContain('Lyon');
    expect(out).toContain('°C');
  });

  it('uses memory location when location is omitted', async () => {
    const weather: WeatherProvider = {
      name: 'mock',
      async getDailyForecast() {
        return {
          resolvedLocation: 'Marseille, France',
          timezone: 'Europe/Paris',
          day: {
            date: '2026-04-18',
            tempMinC: 10,
            tempMaxC: 18,
          },
          source: 'open-meteo',
        };
      },
    };

    const snapshot = {
      factsByLayer: {
        identity: [{ key: 'home_city', value: 'Marseille' }],
        preference: [],
        project: [],
        relationship: [],
        workflow: [],
      },
      sessionSummary: null,
    };

    const out = await runTool(makeCtx(weather, snapshot), {
      type: 'tool',
      name: 'weather.forecast',
      args: { day: 'today' },
    });

    expect(out).toContain('Marseille');
    expect(out).not.toContain("je n'ai pas ta ville");
  });
});

