import { isIP } from 'node:net';

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebOpenResult = {
  url: string;
  title?: string;
  content: string;
};

export interface WebProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<WebSearchResult[]>;
  open(url: string, maxChars?: number): Promise<WebOpenResult>;
}

type SearchProviderName = 'duckduckgo' | 'tavily' | 'google' | 'serper';

type TavilySearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
};

type GoogleCustomSearchResponse = {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
};

type SerperSearchResponse = {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
};

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: DuckDuckGoTopic[];
};

type DuckDuckGoResponse = {
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoTopic[];
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeSpace(value: string) {
  return value
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractHtmlTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  return normalizeSpace(decodeHtmlEntities(m[1]));
}

function htmlToText(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeSpace(decodeHtmlEntities(noTags));
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p)))
    return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === '::1' ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80:')
  );
}

function validateWebUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`URL invalide: "${rawUrl}".`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL bloquee: seuls http/https sont autorises.');
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL bloquee: credentials dans l'URL non autorises.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    throw new Error(`URL bloquee: hote local/interne non autorise (${host}).`);
  }

  const family = isIP(host);
  if (family === 4 && isPrivateIpv4(host)) {
    throw new Error(`URL bloquee: IP privee non autorisee (${host}).`);
  }
  if (family === 6 && isPrivateIpv6(host)) {
    throw new Error(`URL bloquee: IPv6 locale non autorisee (${host}).`);
  }

  return parsed.toString();
}

export class DefaultWebProvider implements WebProvider {
  readonly name: string;
  private readonly searchProvider: SearchProviderName;

  constructor(
    providerRaw = process.env.WEB_SEARCH_PROVIDER ||
      (process.env.SERPER_API_KEY
        ? 'serper'
        : process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX
          ? 'google'
          : process.env.WEB_SEARCH_API_KEY
            ? 'tavily'
            : 'duckduckgo'),
    private readonly searchApiKey = process.env.WEB_SEARCH_API_KEY || '',
    private readonly tavilyBaseUrl = process.env.WEB_SEARCH_BASE_URL ||
      'https://api.tavily.com',
    private readonly duckDuckGoBaseUrl = process.env.WEB_DDG_BASE_URL ||
      'https://api.duckduckgo.com/',
    private readonly timeoutMs = Number(process.env.WEB_TIMEOUT_MS || 12_000),
    private readonly maxPageChars = Number(
      process.env.WEB_MAX_PAGE_CHARS || 6_000,
    ),
    private readonly googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY ||
      '',
    private readonly googleSearchCx = process.env.GOOGLE_SEARCH_CX || '',
    private readonly googleBaseUrl = process.env.GOOGLE_SEARCH_BASE_URL ||
      'https://www.googleapis.com',
    private readonly serperApiKey = process.env.SERPER_API_KEY || '',
    private readonly serperBaseUrl = process.env.SERPER_BASE_URL ||
      'https://google.serper.dev',
  ) {
    const normalized = providerRaw.trim().toLowerCase();
    this.searchProvider =
      normalized === 'tavily' ||
      normalized === 'duckduckgo' ||
      normalized === 'google' ||
      normalized === 'serper'
        ? normalized
        : 'duckduckgo';
    this.name = this.searchProvider;
  }

  async search(query: string, limit = 5): Promise<WebSearchResult[]> {
    const cleaned = query.trim();
    if (!cleaned) return [];
    const safeLimit = clamp(limit, 1, 10);

    if (this.searchProvider === 'tavily') {
      return this.searchWithTavily(cleaned, safeLimit);
    }
    if (this.searchProvider === 'google') {
      return this.searchWithGoogle(cleaned, safeLimit);
    }
    if (this.searchProvider === 'serper') {
      return this.searchWithSerper(cleaned, safeLimit);
    }

    return this.searchWithDuckDuckGo(cleaned, safeLimit);
  }

  async open(url: string, maxChars?: number): Promise<WebOpenResult> {
    const safeUrl = validateWebUrl(url);
    const safeMaxChars = clamp(
      maxChars ?? this.maxPageChars,
      500,
      Math.max(500, this.maxPageChars),
    );

    const response = await this.fetchWithTimeout(safeUrl, {
      method: 'GET',
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/json,text/plain,text/xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'jarvis-ai/1.0 (+web.open)',
      },
    });

    if (!response.ok) {
      throw new Error(
        `web.open a echoue: ${response.status} ${await response.text()}`,
      );
    }

    const contentType = (
      response.headers.get('content-type') || ''
    ).toLowerCase();
    const isTextLike =
      contentType.includes('text/') ||
      contentType.includes('application/json') ||
      contentType.includes('application/xml') ||
      contentType.includes('application/xhtml+xml');
    if (!isTextLike) {
      throw new Error(
        `Type de contenu non supporte: ${contentType || 'inconnu'}.`,
      );
    }

    const rawBody = await response.text();
    let title: string | undefined;
    let content = rawBody;

    if (contentType.includes('html')) {
      title = extractHtmlTitle(rawBody);
      content = htmlToText(rawBody);
    } else if (contentType.includes('json')) {
      try {
        content = JSON.stringify(JSON.parse(rawBody), null, 2);
      } catch {
        content = rawBody;
      }
      content = normalizeSpace(content);
    } else {
      content = normalizeSpace(content);
    }

    return {
      url: response.url || safeUrl,
      ...(title ? { title } : {}),
      content: truncate(content, safeMaxChars),
    };
  }

  private async searchWithTavily(query: string, limit: number) {
    if (!this.searchApiKey.trim()) {
      throw new Error(
        'WEB_SEARCH_PROVIDER=tavily mais WEB_SEARCH_API_KEY est manquant.',
      );
    }

    const response = await this.fetchWithTimeout(
      `${this.tavilyBaseUrl.replace(/\/+$/, '')}/search`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.searchApiKey,
          query,
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: false,
          max_results: limit,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `web.search (tavily) a echoue: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as TavilySearchResponse;
    const rows = payload.results ?? [];
    return rows
      .filter((row) => typeof row.url === 'string' && row.url.trim())
      .slice(0, limit)
      .map((row) => ({
        title: normalizeSpace(row.title || row.url || 'Resultat web'),
        url: row.url!.trim(),
        snippet: truncate(normalizeSpace(row.content || ''), 320),
      }));
  }

  private async searchWithDuckDuckGo(query: string, limit: number) {
    const url =
      `${this.duckDuckGoBaseUrl.replace(/\/+$/, '')}/` +
      `?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(
        `web.search (duckduckgo) a echoue: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as DuckDuckGoResponse;
    const out: WebSearchResult[] = [];
    const seen = new Set<string>();

    const push = (title: string, resultUrl: string, snippet: string) => {
      const cleanUrl = (resultUrl || '').trim();
      if (!cleanUrl || seen.has(cleanUrl)) return;
      seen.add(cleanUrl);
      out.push({
        title: normalizeSpace(title || cleanUrl || 'Resultat web'),
        url: cleanUrl,
        snippet: truncate(normalizeSpace(snippet || ''), 320),
      });
    };

    if (payload.AbstractURL && payload.AbstractText) {
      push(payload.AbstractText, payload.AbstractURL, payload.AbstractText);
    }

    const walk = (topics?: DuckDuckGoTopic[]) => {
      if (!topics?.length) return;
      for (const topic of topics) {
        if (topic.FirstURL && topic.Text) {
          const txt = normalizeSpace(topic.Text);
          const split = txt.split(' - ');
          const title = split[0] || txt;
          const snippet = split.length > 1 ? split.slice(1).join(' - ') : txt;
          push(title, topic.FirstURL, snippet);
        }
        if (topic.Topics?.length) walk(topic.Topics);
        if (out.length >= limit) return;
      }
    };

    walk(payload.RelatedTopics);
    if (out.length) return out.slice(0, limit);

    return this.searchWithDuckDuckGoHtml(query, limit);
  }

  private async searchWithDuckDuckGoHtml(query: string, limit: number) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'user-agent': 'jarvis-ai/1.0 (+web.search)' },
    });

    if (!response.ok) {
      throw new Error(
        `web.search (duckduckgo html) a echoue: ${response.status} ${await response.text()}`,
      );
    }

    const html = await response.text();
    const out: WebSearchResult[] = [];
    const seen = new Set<string>();
    const re =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    for (const m of html.matchAll(re)) {
      if (out.length >= limit) break;
      const rawHref = m[1] || '';
      const resolved = this.resolveDuckDuckGoHref(rawHref);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);

      out.push({
        title:
          normalizeSpace(
            decodeHtmlEntities((m[2] || '').replace(/<[^>]+>/g, ' ')),
          ) || resolved,
        url: resolved,
        snippet: '',
      });
    }

    return out;
  }

  private resolveDuckDuckGoHref(rawHref: string) {
    const href = decodeHtmlEntities(rawHref || '').trim();
    if (!href) return '';
    if (href.startsWith('http://') || href.startsWith('https://')) return href;

    try {
      const parsed = new URL(href, 'https://duckduckgo.com');
      const encoded = parsed.searchParams.get('uddg');
      if (encoded) return decodeURIComponent(encoded);
    } catch {
      return '';
    }
    return '';
  }

  private async searchWithGoogle(query: string, limit: number) {
    if (!this.googleSearchApiKey.trim() || !this.googleSearchCx.trim()) {
      throw new Error(
        'WEB_SEARCH_PROVIDER=google mais GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX sont manquants.',
      );
    }

    const endpoint =
      `${this.googleBaseUrl.replace(/\/+$/, '')}/customsearch/v1` +
      `?key=${encodeURIComponent(this.googleSearchApiKey)}` +
      `&cx=${encodeURIComponent(this.googleSearchCx)}` +
      `&q=${encodeURIComponent(query)}` +
      `&num=${encodeURIComponent(String(limit))}`;
    const response = await this.fetchWithTimeout(endpoint, { method: 'GET' });

    if (!response.ok) {
      const body = await response.text();
      const denied =
        response.status === 403 &&
        /does not have the access to custom search json api|permission_denied/i.test(
          body,
        );
      if (denied) {
        // Google bloque l'accès pour certains projets; fallback automatique.
        return this.searchWithDuckDuckGo(query, limit);
      }
      throw new Error(
        `web.search (google) a echoue: ${response.status} ${body}`,
      );
    }

    const payload = (await response.json()) as GoogleCustomSearchResponse;
    return (payload.items ?? [])
      .filter((item) => typeof item.link === 'string' && item.link.trim())
      .slice(0, limit)
      .map((item) => ({
        title: normalizeSpace(item.title || item.link || 'Resultat web'),
        url: item.link!.trim(),
        snippet: truncate(normalizeSpace(item.snippet || ''), 320),
      }));
  }

  private async searchWithSerper(query: string, limit: number) {
    if (!this.serperApiKey.trim()) {
      throw new Error(
        'WEB_SEARCH_PROVIDER=serper mais SERPER_API_KEY est manquant.',
      );
    }

    const endpoint = `${this.serperBaseUrl.replace(/\/+$/, '')}/search`;
    const response = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.serperApiKey,
      },
      body: JSON.stringify({
        q: query,
        num: limit,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `web.search (serper) a echoue: ${response.status} ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as SerperSearchResponse;
    return (payload.organic ?? [])
      .filter((item) => typeof item.link === 'string' && item.link.trim())
      .slice(0, limit)
      .map((item) => ({
        title: normalizeSpace(item.title || item.link || 'Resultat web'),
        url: item.link!.trim(),
        snippet: truncate(normalizeSpace(item.snippet || ''), 320),
      }));
  }

  private async fetchWithTimeout(input: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Requete web expiree.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
