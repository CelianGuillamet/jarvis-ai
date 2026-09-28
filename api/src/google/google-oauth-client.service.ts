import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { GoogleCredentialService } from './google-credential.service';
import {
  GoogleIntegrationError,
  type GoogleIntegrationErrorCode,
} from './google-integration.error';
import { buildGoogleConnectionStatus } from './google-scopes';

@Injectable()
export class GoogleOAuthClientService {
  private readonly logger = new Logger(GoogleOAuthClientService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly credentials: GoogleCredentialService,
  ) {}

  createOAuthClient() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri)
      throw new GoogleIntegrationError(
        'GOOGLE_OAUTH_CONFIG_MISSING',
        'Configuration Google OAuth manquante.',
      );
    const client = new google.auth.OAuth2({
      clientId,
      clientSecret,
      redirectUri,
      transporterOptions: { timeout: 10_000 },
    });
    client.transporter.interceptors.response.add({
      rejected: (error) => {
        const status = error.response?.status;
        const scopeMissing =
          status === 403 && /insufficient|scope/i.test(error.message);
        // Preserve only the status needed by OAuth's built-in refresh/retry.
        // Request bodies, headers, tokens, provider messages and causes must not
        // reach Nest logging or the browser through a raw transport exception.
        const safe = new Error(
          scopeMissing
            ? 'Insufficient permissions.'
            : 'Google request failed.',
        );
        Object.assign(safe, {
          code: status,
          response: status ? { status, config: {} } : undefined,
        });
        throw safe;
      },
    });
    return client;
  }

  async isConnected(conversationId: string) {
    return !!(await this.credentials.find(conversationId));
  }

  async getConnectionStatus(conversationId: string) {
    const row = await this.credentials.find(conversationId);
    return buildGoogleConnectionStatus(row?.scope);
  }

  async createAuthorizedClient(
    conversationId: string,
    missingConnectionCode: GoogleIntegrationErrorCode,
  ) {
    const row = await this.credentials.find(conversationId);
    if (!row)
      throw new GoogleIntegrationError(missingConnectionCode, conversationId);
    const oauth2 = this.createOAuthClient();
    oauth2.setCredentials(this.credentials.credentials(row));
    oauth2.on('tokens', (tokens) => {
      void this.credentials.refresh(row, tokens).catch(() => {
        this.logger.warn(
          'Impossible de persister les identifiants Google actualisés.',
        );
      });
    });
    return oauth2;
  }
}
