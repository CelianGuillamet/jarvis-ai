import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  HomeAddressError,
  isPrivateAddress,
  parseHomeBaseUrl,
  validateHomeTarget,
} from './home-address-policy';
import {
  HomeAssistantClient,
  HomeAssistantError,
} from './home-assistant.client';

describe('Home Assistant address policy', () => {
  it.each([
    ['10.0.0.5', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.1.20', true],
    ['127.0.0.1', true],
    ['::1', true],
    ['fd12:3456::1', true],
    ['::ffff:192.168.1.2', true],
    ['::ffff:8.8.8.8', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['8.8.8.8', false],
    ['2001:4860:4860::8888', false],
    ['224.0.0.1', false],
  ])('classifies %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });

  it.each([
    'ftp://192.168.1.2',
    'http://user:pass@192.168.1.2:8123',
    'http://192.168.1.2:8123/api',
    'http://192.168.1.2:8123/?token=1',
    'http://192.168.1.2:22',
    'http://192.168.1.2:8123/#x',
    'not a url',
    'file:///etc/passwd',
  ])('rejects the address form %s', (input) => {
    expect(() => parseHomeBaseUrl(input)).toThrow(HomeAddressError);
  });

  it('accepts a LAN literal, a trailing slash and an https name that resolves privately', async () => {
    await expect(
      validateHomeTarget('http://192.168.1.20:8123/'),
    ).resolves.toMatchObject({ address: '192.168.1.20', family: 4 });
    const lookup = jest
      .fn()
      .mockResolvedValue([{ address: '10.0.0.8', family: 4 }]);
    await expect(
      validateHomeTarget('https://homeassistant.local', lookup),
    ).resolves.toMatchObject({ address: '10.0.0.8' });
    expect(lookup).toHaveBeenCalledWith('homeassistant.local');
  });

  it('refuses public destinations, mixed DNS answers and failed lookups', async () => {
    await expect(validateHomeTarget('http://8.8.8.8:8123')).rejects.toThrow(
      HomeAddressError,
    );
    await expect(validateHomeTarget('http://169.254.169.254')).rejects.toThrow(
      HomeAddressError,
    );
    await expect(
      validateHomeTarget('https://evil.example', () =>
        Promise.resolve([
          { address: '192.168.1.5', family: 4 },
          { address: '93.184.216.34', family: 4 },
        ]),
      ),
    ).rejects.toThrow(HomeAddressError);
    await expect(
      validateHomeTarget('https://missing.example', () =>
        Promise.reject(new Error('ENOTFOUND secret-detail')),
      ),
    ).rejects.toThrow('introuvable');
  });
});

describe('Home Assistant client against a fake server', () => {
  const servers: http.Server[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((s) => new Promise((r) => s.close(r))),
    );
  });
  async function serve(handler: http.RequestListener) {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    return {
      target: {
        url: new URL(`http://ha.invalid:${port}`),
        hostname: 'ha.invalid',
        address: '127.0.0.1',
        family: 4 as const,
      },
    };
  }
  const json = (res: http.ServerResponse, body: unknown, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  it('pins the connection to the validated address and sends the bearer token', async () => {
    let seen: http.IncomingHttpHeaders = {};
    const { target } = await serve((req, res) => {
      seen = req.headers;
      json(res, { message: 'API running.' });
    });
    await new HomeAssistantClient(target, 'secret-token').ping();
    expect(seen.authorization).toBe('Bearer secret-token');
    expect(seen.host).toContain('ha.invalid');
  });

  it('reads states and a single entity', async () => {
    const state = {
      entity_id: 'light.salon',
      state: 'on',
      attributes: { brightness: 128 },
    };
    const { target } = await serve((req, res) =>
      json(res, req.url === '/api/states' ? [state, { bad: true }] : state),
    );
    const client = new HomeAssistantClient(target, 't');
    await expect(client.states()).resolves.toEqual([state]);
    await expect(client.state('light.salon')).resolves.toEqual(state);
  });

  it('maps unauthorized and unexpected payloads without leaking the token', async () => {
    const denied = await serve((_req, res) => json(res, {}, 401));
    await expect(
      new HomeAssistantClient(denied.target, 'secret-token').ping(),
    ).rejects.toMatchObject({ kind: 'unauthorized' });
    const odd = await serve((_req, res) => json(res, { message: 'other' }));
    await expect(
      new HomeAssistantClient(odd.target, 'secret-token').ping(),
    ).rejects.toMatchObject({ kind: 'invalid' });
    const error = await new HomeAssistantClient(denied.target, 'secret-token')
      .ping()
      .catch((e: Error) => e);
    expect(String((error as Error).message)).not.toContain('secret-token');
  });

  it('never follows a redirect', async () => {
    let followed = 0;
    const other = await serve((_req, res) => {
      followed += 1;
      json(res, { message: 'API running.' });
    });
    const { target } = await serve((_req, res) => {
      res.writeHead(302, {
        location: `http://127.0.0.1:${other.target.url.port}/`,
      });
      res.end();
    });
    await expect(
      new HomeAssistantClient(target, 't').ping(),
    ).rejects.toMatchObject({ kind: 'invalid' });
    expect(followed).toBe(0);
  });

  it('refuses oversized and non-JSON responses', async () => {
    const big = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[' + '0,'.repeat(400_000) + '0]');
    });
    await expect(
      new HomeAssistantClient(big.target, 't').states(),
    ).rejects.toMatchObject({ kind: 'invalid' });
    const html = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>');
    });
    await expect(
      new HomeAssistantClient(html.target, 't').ping(),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('times out: reads are safe to repeat, an interrupted write is of unknown outcome', async () => {
    const { target } = await serve(() => undefined);
    const client = new HomeAssistantClient(target, 't', 100);
    const read = await client.states().catch((e: HomeAssistantError) => e);
    expect(read).toMatchObject({
      kind: 'timeout',
      mayHaveReachedServer: false,
    });
    const write = await client
      .callService('light', 'turn_on', { entity_id: 'light.salon' })
      .catch((e: HomeAssistantError) => e);
    expect(write).toMatchObject({
      kind: 'timeout',
      mayHaveReachedServer: true,
    });
  });

  it('reports a closed port as unreachable', async () => {
    const { target } = await serve((_req, res) => json(res, []));
    const closed = {
      ...target,
      url: new URL('http://ha.invalid:1'),
    };
    await expect(
      new HomeAssistantClient(closed, 't', 500).states(),
    ).rejects.toMatchObject({ kind: 'unreachable' });
  });
});
