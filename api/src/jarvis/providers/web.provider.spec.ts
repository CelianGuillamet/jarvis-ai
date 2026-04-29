import { DefaultWebProvider } from './web.provider';

describe('DefaultWebProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('maps DuckDuckGo results', async () => {
    const payload = {
      AbstractText: 'OpenAI - AI research and products',
      AbstractURL: 'https://openai.com',
      RelatedTopics: [
        {
          Text: 'Artificial intelligence - Field of study',
          FirstURL: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
        },
      ],
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

    const provider = new DefaultWebProvider('duckduckgo');
    const results = await provider.search('ia', 5);

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].url).toBe('https://openai.com');
    expect(results[1].url).toBe(
      'https://en.wikipedia.org/wiki/Artificial_intelligence',
    );
  });

  it('extracts title and text in web.open', async () => {
    const html = `
      <html>
        <head><title>Test page</title></head>
        <body><h1>Bonjour</h1><p>Contenu web</p></body>
      </html>
    `;
    global.fetch = jest.fn().mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const provider = new DefaultWebProvider('duckduckgo');
    const page = await provider.open('https://example.com/test');

    expect(page.title).toBe('Test page');
    expect(page.content).toContain('Bonjour');
    expect(page.content).toContain('Contenu web');
  });

  it('blocks localhost urls', async () => {
    const provider = new DefaultWebProvider('duckduckgo');
    await expect(provider.open('http://localhost:3000')).rejects.toThrow(
      'URL bloquee',
    );
  });

  it('maps Google custom search results', async () => {
    const payload = {
      items: [
        {
          title: 'Formula 1 - Schedule',
          link: 'https://www.formula1.com/en/racing/2026',
          snippet: 'Find race dates and venues for the current season.',
        },
      ],
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

    const provider = new DefaultWebProvider(
      'google',
      '',
      'https://api.tavily.com',
      'https://api.duckduckgo.com/',
      12000,
      6000,
      'google-key',
      'search-cx',
      'https://www.googleapis.com',
    );
    const results = await provider.search('prochain grand prix f1', 5);

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.formula1.com/en/racing/2026');
    expect(results[0].title).toContain('Formula 1');
  });

  it('falls back to DuckDuckGo when Google returns 403 permission denied', async () => {
    const ddgPayload = {
      RelatedTopics: [
        {
          Text: 'F1 Calendar - Upcoming race schedule',
          FirstURL: 'https://www.formula1.com/en/racing/2026',
        },
      ],
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                'This project does not have the access to Custom Search JSON API.',
              status: 'PERMISSION_DENIED',
            },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ddgPayload), { status: 200 }),
      );

    const provider = new DefaultWebProvider(
      'google',
      '',
      'https://api.tavily.com',
      'https://api.duckduckgo.com/',
      12000,
      6000,
      'google-key',
      'search-cx',
      'https://www.googleapis.com',
    );

    const results = await provider.search('prochain grand prix f1', 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.formula1.com/en/racing/2026');
  });

  it('maps Serper Google results', async () => {
    const payload = {
      organic: [
        {
          title: 'Formula 1 calendar',
          link: 'https://www.formula1.com/en/racing/2026',
          snippet: 'Race schedule and locations.',
        },
      ],
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

    const provider = new DefaultWebProvider(
      'serper',
      '',
      'https://api.tavily.com',
      'https://api.duckduckgo.com/',
      12000,
      6000,
      '',
      '',
      'https://www.googleapis.com',
      'serper-key',
      'https://google.serper.dev',
    );
    const results = await provider.search('prochain grand prix f1', 5);

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.formula1.com/en/racing/2026');
    expect(results[0].title).toContain('Formula 1');
  });
});
