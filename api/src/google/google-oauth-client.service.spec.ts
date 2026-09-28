import type { ConfigService } from '@nestjs/config';
import { Common } from 'googleapis';
import type { GoogleCredentialService } from './google-credential.service';
import { GoogleOAuthClientService } from './google-oauth-client.service';

function fixture() {
  const row = {
    id: 'credential',
    scope: 'https://www.googleapis.com/auth/gmail.modify',
  };
  const credentials = {
    find: jest.fn().mockResolvedValue(row),
    credentials: jest.fn().mockReturnValue({ refresh_token: 'refresh-secret' }),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: (key: string) =>
      ({
        GOOGLE_CLIENT_ID: 'client',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
      })[key],
  };
  return {
    row,
    credentials,
    service: new GoogleOAuthClientService(
      config as unknown as ConfigService,
      credentials as unknown as GoogleCredentialService,
    ),
  };
}

describe('GoogleOAuthClientService', () => {
  it.each([
    {
      status: 401,
      providerMessage: 'private-refresh-token',
      safeMessage: 'Google request failed.',
    },
    {
      status: 403,
      providerMessage: 'Insufficient permissions private-refresh-token',
      safeMessage: 'Insufficient permissions.',
    },
  ])(
    'strips credentials from transport failures while preserving status $status',
    async ({ status, providerMessage, safeMessage }) => {
      const { service } = fixture();
      const client = service.createOAuthClient();
      client.setCredentials({
        access_token: 'private-access-token',
        expiry_date: Date.now() + 3600000,
      });
      const error: unknown = await client
        .request({
          url: 'https://google-fixture.invalid/test',
          retry: false,
          adapter: (options) => {
            return Promise.reject(
              new Common.GaxiosError(
                providerMessage,
                options,
                Object.assign(new Response(null, { status }), {
                  config: options,
                  data: { access_token: 'private-access-token' },
                }),
              ),
            );
          },
        })
        .catch((failure: unknown) => failure);
      expect(error).toMatchObject({
        message: safeMessage,
        response: { status, config: {} },
      });
      expect(JSON.stringify(error)).not.toContain('private-');
      expect(JSON.stringify(error)).not.toContain('Bearer');
    },
  );

  it('reads connection status from the account credential', async () => {
    const { service, credentials } = fixture();
    await expect(service.getConnectionStatus('conversation')).resolves.toEqual({
      connected: true,
      gmailConnected: true,
      calendarConnected: false,
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    });
    expect(credentials.find).toHaveBeenCalledWith('conversation');
  });

  it('fails closed without an owned credential', async () => {
    const { service, credentials } = fixture();
    credentials.find.mockResolvedValueOnce(null);
    await expect(
      service.createAuthorizedClient('conversation', 'GMAIL_NOT_CONNECTED'),
    ).rejects.toMatchObject({ code: 'GMAIL_NOT_CONNECTED' });
  });

  it('routes refresh events through encrypted storage with the original generation', async () => {
    const { service, credentials, row } = fixture();
    const client = await service.createAuthorizedClient(
      'conversation',
      'GOOGLE_NOT_CONNECTED',
    );
    client.emit('tokens', { access_token: 'new-access-token' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(credentials.refresh).toHaveBeenCalledWith(row, {
      access_token: 'new-access-token',
    });
  });
});
