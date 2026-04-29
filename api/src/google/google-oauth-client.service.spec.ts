import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../prisma/prisma.service';
import { GoogleIntegrationError } from './google-integration.error';
import { GoogleOAuthClientService } from './google-oauth-client.service';

type ServiceOptions = {
  config?: Record<string, string | undefined>;
  token?: {
    refreshToken: string;
    accessToken: string | null;
    tokenType: string | null;
    scope: string | null;
    expiryDate: Date | null;
  } | null;
};

function makeService(options: ServiceOptions = {}) {
  const configValues: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
    ...options.config,
  };

  const prisma = {
    googleOAuthToken: {
      findUnique: jest.fn().mockResolvedValue(options.token ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const config = {
    get: jest.fn((key: string): string | undefined => configValues[key]),
  };

  return {
    service: new GoogleOAuthClientService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    ),
    prisma,
  };
}

describe('GoogleOAuthClientService', () => {
  it('computes the connection status from granted scopes', async () => {
    const { service } = makeService({
      token: {
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
        tokenType: 'Bearer',
        scope:
          'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify',
        expiryDate: new Date('2026-04-17T08:00:00.000Z'),
      },
    });

    await expect(service.getConnectionStatus('session-1')).resolves.toEqual({
      scopes: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      connected: true,
      calendarConnected: true,
      gmailConnected: true,
    });
  });

  it('throws a typed error when the session is not connected', async () => {
    const { service } = makeService({ token: null });

    await expect(
      service.createAuthorizedClient('session-1', 'GMAIL_NOT_CONNECTED'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoogleIntegrationError>>({
        code: 'GMAIL_NOT_CONNECTED',
        details: 'session-1',
      }),
    );
  });

  it('persists refreshed Google tokens emitted by the oauth client', async () => {
    const existingToken = {
      refreshToken: 'refresh-token',
      accessToken: 'access-token',
      tokenType: 'Bearer',
      scope: 'scope-a',
      expiryDate: new Date('2026-04-17T08:00:00.000Z'),
    };
    const { service, prisma } = makeService({ token: existingToken });

    const client = await service.createAuthorizedClient(
      'session-1',
      'GOOGLE_NOT_CONNECTED',
    );

    (
      client as typeof client & {
        emit: (event: 'tokens', tokens: Record<string, unknown>) => boolean;
      }
    ).emit('tokens', {
      refresh_token: 'refresh-token-2',
      access_token: 'access-token-2',
      token_type: 'Bearer',
      scope: 'scope-b',
      expiry_date: 1_777_200_000_000,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.googleOAuthToken.update).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: {
        refreshToken: 'refresh-token-2',
        accessToken: 'access-token-2',
        tokenType: 'Bearer',
        scope: 'scope-b',
        expiryDate: new Date(1_777_200_000_000),
      },
    });
  });
});
