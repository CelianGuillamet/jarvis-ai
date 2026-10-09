import http from 'node:http';
import https from 'node:https';
import type { ValidatedHomeTarget } from './home-address-policy';

export const HA_TIMEOUT_MS = 5_000;
export const HA_MAX_RESPONSE_BYTES = 512 * 1024;

export class HomeAssistantError extends Error {
  constructor(
    readonly kind: 'unreachable' | 'unauthorized' | 'invalid' | 'timeout',
    /** True once a request may have reached the server; the effect must be treated as unknown. */
    readonly mayHaveReachedServer: boolean,
    message: string,
  ) {
    super(message);
  }
}

export type HaState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};

/** Bounded JSON client pinned to a validated address. It never follows redirects. */
export class HomeAssistantClient {
  constructor(
    private readonly target: ValidatedHomeTarget,
    private readonly token: string,
    private readonly timeoutMs = HA_TIMEOUT_MS,
  ) {}

  async ping(): Promise<void> {
    const body = await this.request('GET', '/api/');
    if (
      !body ||
      typeof body !== 'object' ||
      !('message' in body) ||
      body.message !== 'API running.'
    )
      throw new HomeAssistantError(
        'invalid',
        false,
        'Réponse Home Assistant inattendue.',
      );
  }

  async states(): Promise<HaState[]> {
    const body = await this.request('GET', '/api/states');
    if (!Array.isArray(body))
      throw new HomeAssistantError('invalid', false, 'États invalides.');
    return body.filter(isState);
  }

  async state(entityId: string): Promise<HaState> {
    const body = await this.request(
      'GET',
      `/api/states/${encodeURIComponent(entityId)}`,
    );
    if (!isState(body))
      throw new HomeAssistantError('invalid', false, 'État invalide.');
    return body;
  }

  async callService(
    domain: 'light' | 'scene',
    service: 'turn_on' | 'turn_off',
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.request('POST', `/api/services/${domain}/${service}`, data);
  }

  private request(
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
  ): Promise<unknown> {
    const { url, address, family } = this.target;
    const transport = url.protocol === 'https:' ? https : http;
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      let reached = false;
      const request = transport.request(
        {
          protocol: url.protocol,
          host: this.target.hostname,
          port: url.port || undefined,
          path,
          method,
          headers: {
            authorization: `Bearer ${this.token}`,
            accept: 'application/json',
            ...(body
              ? {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(body),
                }
              : {}),
          },
          // Connect to the address that passed the LAN check, whatever DNS says now.
          lookup: (_host, options, callback) => {
            const done = callback as (...a: unknown[]) => void;
            if (options && typeof options === 'object' && options.all)
              done(null, [{ address, family }]);
            else done(null, address, family);
          },
          timeout: this.timeoutMs,
          servername: this.target.hostname,
        },
        (response) => {
          reached = true;
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            response.destroy();
            reject(
              new HomeAssistantError(
                'invalid',
                true,
                'Redirection refusée par Jarvis.',
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > HA_MAX_RESPONSE_BYTES) {
              response.destroy();
              reject(
                new HomeAssistantError(
                  'invalid',
                  true,
                  'Réponse Home Assistant trop volumineuse.',
                ),
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on('error', () =>
            reject(
              new HomeAssistantError(
                'unreachable',
                true,
                'Connexion interrompue.',
              ),
            ),
          );
          response.on('end', () => {
            if (status === 401 || status === 403)
              return reject(
                new HomeAssistantError(
                  'unauthorized',
                  true,
                  'Jeton Home Assistant refusé.',
                ),
              );
            if (status < 200 || status >= 300)
              return reject(
                new HomeAssistantError(
                  'invalid',
                  true,
                  `Home Assistant a répondu ${status}.`,
                ),
              );
            const type = String(response.headers['content-type'] ?? '');
            if (!type.includes('application/json'))
              return reject(
                new HomeAssistantError('invalid', true, 'Type inattendu.'),
              );
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              reject(new HomeAssistantError('invalid', true, 'JSON invalide.'));
            }
          });
        },
      );
      request.on('timeout', () => {
        request.destroy();
        reject(
          new HomeAssistantError(
            'timeout',
            method === 'POST' || reached,
            'Home Assistant ne répond pas.',
          ),
        );
      });
      request.on('error', () =>
        reject(
          new HomeAssistantError(
            'unreachable',
            method === 'POST' && reached,
            'Home Assistant est injoignable.',
          ),
        ),
      );
      if (body) request.write(body);
      request.end();
    });
  }
}

function isState(value: unknown): value is HaState {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as HaState).entity_id === 'string' &&
    typeof (value as HaState).state === 'string' &&
    !!(value as HaState).attributes &&
    typeof (value as HaState).attributes === 'object'
  );
}
