import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthStateService } from './oauth-state.service';
import { GoogleOAuthClientService } from './google-oauth-client.service';
import { asGoogleIntegrationError } from './google-integration.error';
import { GOOGLE_AUTH_SCOPES } from './google-scopes';

type GoogleOAuthTokens = {
  refresh_token?: string | null;
  access_token?: string | null;
  token_type?: string | null;
  scope?: string | null;
  expiry_date?: number | null;
};

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly oauthClients: GoogleOAuthClientService,
    private readonly prisma: PrismaService,
    private readonly state: OAuthStateService,
  ) {}

  getAuthUrl(sessionId: string) {
    try {
      const oauth2 = this.oauthClients.createOAuthClient();
      const state = this.state.create(sessionId);

      return oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [...GOOGLE_AUTH_SCOPES],
        include_granted_scopes: true,
        state,
      });
    } catch (error) {
      this.rethrowConfigError(error);
    }
  }

  async handleCallback(code: string, state: string) {
    if (!code?.trim()) throw new BadRequestException('Code OAuth manquant');
    if (!state?.trim()) throw new BadRequestException('State OAuth manquant');

    const sessionId = this.state.consume(state);
    if (!sessionId)
      throw new BadRequestException('State OAuth invalide/expiré');

    const existingToken = await this.prisma.googleOAuthToken.findUnique({
      where: { sessionId },
      select: { refreshToken: true },
    });

    let tokens: GoogleOAuthTokens;
    try {
      const oauth2 = this.oauthClients.createOAuthClient();
      const result = (await oauth2.getToken(code)) as {
        tokens: GoogleOAuthTokens;
      };
      tokens = result.tokens;
    } catch (error) {
      this.rethrowConfigError(error);
    }

    const refreshToken = tokens.refresh_token ?? existingToken?.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException(
        'Pas de refresh_token reçu. Réessaie la connexion (prompt=consent).',
      );
    }

    const expiryDate =
      tokens.expiry_date != null ? new Date(tokens.expiry_date) : null;
    const tokenData = {
      refreshToken,
      accessToken: tokens.access_token ?? null,
      tokenType: tokens.token_type ?? null,
      scope: tokens.scope ?? null,
      expiryDate,
    };

    await this.prisma.googleOAuthToken.upsert({
      where: { sessionId },
      create: { sessionId, ...tokenData },
      update: tokenData,
    });

    return sessionId;
  }

  async status(sessionId: string) {
    return this.oauthClients.getConnectionStatus(sessionId);
  }

  private rethrowConfigError(error: unknown): never {
    const googleError = asGoogleIntegrationError(error);
    if (googleError?.code === 'GOOGLE_OAUTH_CONFIG_MISSING') {
      throw new BadRequestException(googleError.details ?? googleError.message);
    }
    throw error;
  }
}
