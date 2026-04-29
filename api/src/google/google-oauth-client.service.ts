import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

import { PrismaService } from '../prisma/prisma.service';
import {
  GoogleIntegrationError,
  type GoogleIntegrationErrorCode,
} from './google-integration.error';
import { buildGoogleConnectionStatus } from './google-scopes';

type StoredGoogleToken = {
  refreshToken: string;
  accessToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiryDate: Date | null;
};

type RefreshedTokens = {
  refresh_token?: string | null;
  access_token?: string | null;
  token_type?: string | null;
  scope?: string | null;
  expiry_date?: number | null;
};

@Injectable()
export class GoogleOAuthClientService {
  private readonly logger = new Logger(GoogleOAuthClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  createOAuthClient() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new GoogleIntegrationError(
        'GOOGLE_OAUTH_CONFIG_MISSING',
        'Google OAuth env manquant: GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI',
      );
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  async isConnected(sessionId: string) {
    const row = await this.prisma.googleOAuthToken.findUnique({
      where: { sessionId },
      select: { id: true },
    });
    return !!row;
  }

  async getConnectionStatus(sessionId: string) {
    const row = await this.prisma.googleOAuthToken.findUnique({
      where: { sessionId },
      select: { scope: true },
    });
    return buildGoogleConnectionStatus(row?.scope);
  }

  async createAuthorizedClient(
    sessionId: string,
    missingConnectionCode: GoogleIntegrationErrorCode,
  ) {
    const row = await this.prisma.googleOAuthToken.findUnique({
      where: { sessionId },
      select: {
        refreshToken: true,
        accessToken: true,
        tokenType: true,
        scope: true,
        expiryDate: true,
      },
    });
    if (!row) {
      throw new GoogleIntegrationError(missingConnectionCode, sessionId);
    }

    const oauth2 = this.createOAuthClient();
    oauth2.setCredentials({
      refresh_token: row.refreshToken,
      access_token: row.accessToken ?? undefined,
      token_type: row.tokenType ?? undefined,
      scope: row.scope ?? undefined,
      expiry_date: row.expiryDate ? row.expiryDate.getTime() : undefined,
    });

    oauth2.on('tokens', (tokens) => {
      void this.persistRefreshedTokens(sessionId, row, tokens).catch(
        (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Impossible de persister les tokens Google pour ${sessionId}: ${message}`,
          );
        },
      );
    });

    return oauth2;
  }

  private async persistRefreshedTokens(
    sessionId: string,
    current: StoredGoogleToken,
    tokens: RefreshedTokens,
  ) {
    const hasUsefulTokenUpdate =
      tokens.refresh_token !== undefined ||
      tokens.access_token !== undefined ||
      tokens.token_type !== undefined ||
      tokens.scope !== undefined ||
      tokens.expiry_date !== undefined;

    if (!hasUsefulTokenUpdate) return;

    await this.prisma.googleOAuthToken.update({
      where: { sessionId },
      data: {
        refreshToken: tokens.refresh_token ?? current.refreshToken,
        accessToken: tokens.access_token ?? current.accessToken ?? null,
        tokenType: tokens.token_type ?? current.tokenType ?? null,
        scope: tokens.scope ?? current.scope ?? null,
        expiryDate:
          tokens.expiry_date !== undefined && tokens.expiry_date !== null
            ? new Date(tokens.expiry_date)
            : (current.expiryDate ?? null),
      },
    });
  }
}
