import { selectedModelProvider } from '../jarvis/providers/model-selection';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { GOOGLE_AUTH_SCOPES } from '../google/google-scopes';
import { PrivacyDisclosureSchema } from '../contracts/v1';

@Injectable()
export class PrivacyDisclosureService {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  read() {
    const requested = (
      this.config.get<string>('LLM_PROVIDER') ?? ''
    ).toLowerCase();
    const key = this.config.get<string>('OPENAI_API_KEY');
    // Same selection as JarvisService, including its explicit fallback.
    const openai = selectedModelProvider(requested, key) === 'openai';
    const endpoint = new URL(
      openai
        ? this.config.get<string>('OPENAI_BASE_URL') ||
            'https://api.openai.com/v1'
        : this.config.get<string>('OLLAMA_URL') || 'http://localhost:11434',
    );
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
      endpoint.hostname,
    );
    const googleTools = Boolean(
      this.config.get('GOOGLE_CLIENT_ID') &&
      this.config.get('GOOGLE_CLIENT_SECRET'),
    );
    return PrivacyDisclosureSchema.parse({
      model: {
        provider: openai ? 'openai' : 'ollama',
        endpointHost: endpoint.hostname,
        transport: loopback ? 'loopback' : 'network',
      },
      google: {
        signInConfigured: Boolean(this.auth.config.google),
        toolsConfigured: googleTools,
        requestedScopes: googleTools ? [...GOOGLE_AUTH_SCOPES] : [],
      },
      weatherHosts: [
        ...new Set([
          new URL(
            this.config.get<string>('WEATHER_GEO_BASE_URL') ||
              'https://geocoding-api.open-meteo.com',
          ).hostname,
          new URL(
            this.config.get<string>('WEATHER_BASE_URL') ||
              'https://api.open-meteo.com',
          ).hostname,
        ]),
      ],
      webRetrieval: 'disabled',
      processingEnabled:
        this.config.get('PRIVACY_WORKER_ENABLED') !== 'false' &&
        this.config.get('NODE_ENV') !== 'test',
      retention: {
        diagnosticDays: 14,
        conversationDays: 90,
        receiptDays: 7,
        maximumBackupDays: 30,
        userData: 'until-deleted',
        commandJournal: 'until-account-deletion',
      },
      backups: 'operator-managed',
    });
  }
}
