import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import { GoogleIntegrationError } from './google-integration.error';
import type { GoogleOAuthClientService } from './google-oauth-client.service';
import { GoogleAuthService } from './google-auth.service';
import type { OAuthStateService } from './oauth-state.service';

type ServiceOptions = {
  consumeState?: string | null;
  existingRefreshToken?: string | null;
  oauthTokens?: {
    refresh_token?: string;
    access_token?: string;
    token_type?: string;
    scope?: string;
    expiry_date?: number;
  };
  oauthClientError?: Error;
};

function makeService(options: ServiceOptions = {}) {
  const oauthClient = {
    generateAuthUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
    getToken: jest.fn().mockResolvedValue({
      tokens: options.oauthTokens ?? {},
    }),
  };

  const oauthClients = {
    createOAuthClient: jest.fn(() => {
      if (options.oauthClientError) throw options.oauthClientError;
      return oauthClient;
    }),
    getConnectionStatus: jest.fn().mockResolvedValue({
      scopes: [],
      connected: false,
      calendarConnected: false,
      gmailConnected: false,
    }),
  };

  const prisma = {
    googleOAuthToken: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.existingRefreshToken
            ? { refreshToken: options.existingRefreshToken }
            : null,
        ),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  const state = {
    create: jest.fn().mockReturnValue('state-token'),
    consume: jest.fn().mockReturnValue(options.consumeState ?? 'session-1'),
  };

  return {
    service: new GoogleAuthService(
      oauthClients as unknown as GoogleOAuthClientService,
      prisma as unknown as PrismaService,
      state as unknown as OAuthStateService,
    ),
    oauthClient,
    prisma,
  };
}

describe('GoogleAuthService', () => {
  it('reuses the stored refresh token when Google does not return a new one', async () => {
    const { service, prisma } = makeService({
      existingRefreshToken: 'refresh-token-stored',
      oauthTokens: {
        access_token: 'access-token',
        token_type: 'Bearer',
        scope: 'scope-a',
        expiry_date: 1_777_200_000_000,
      },
    });

    await expect(
      service.handleCallback('google-code', 'state-token'),
    ).resolves.toBe('session-1');

    expect(prisma.googleOAuthToken.upsert).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      create: {
        sessionId: 'session-1',
        refreshToken: 'refresh-token-stored',
        accessToken: 'access-token',
        tokenType: 'Bearer',
        scope: 'scope-a',
        expiryDate: new Date(1_777_200_000_000),
      },
      update: {
        refreshToken: 'refresh-token-stored',
        accessToken: 'access-token',
        tokenType: 'Bearer',
        scope: 'scope-a',
        expiryDate: new Date(1_777_200_000_000),
      },
    });
  });

  it('rejects the callback when there is no refresh token to persist', async () => {
    const { service } = makeService({
      oauthTokens: {
        access_token: 'access-token',
      },
    });

    await expect(
      service.handleCallback('google-code', 'state-token'),
    ).rejects.toThrow(BadRequestException);
  });

  it('converts missing OAuth configuration into a bad request', () => {
    const { service } = makeService({
      oauthClientError: new GoogleIntegrationError(
        'GOOGLE_OAUTH_CONFIG_MISSING',
        'Google OAuth env manquant',
      ),
    });

    expect(() => service.getAuthUrl('session-1')).toThrow(BadRequestException);
  });
});
