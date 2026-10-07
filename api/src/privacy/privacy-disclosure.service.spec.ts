import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { PrivacyDisclosureService } from './privacy-disclosure.service';

function disclosure(config: Record<string, string> = {}, google = false) {
  return new PrivacyDisclosureService(new ConfigService(config), {
    config: { google: google ? {} : null },
  } as unknown as AuthService).read();
}

describe('Configured privacy disclosure', () => {
  it('describes the default local model, disabled retrieval and remote weather without secrets', () => {
    const value = disclosure({
      LLM_PROVIDER: 'ollama',
      OPENAI_API_KEY: 'unused-secret',
    });
    expect(value.model).toEqual({
      provider: 'ollama',
      transport: 'loopback',
      endpointHost: 'localhost',
    });
    expect(value.webRetrieval).toBe('disabled');
    expect(value.weatherHosts).toEqual([
      'geocoding-api.open-meteo.com',
      'api.open-meteo.com',
    ]);
    expect(JSON.stringify(value)).not.toContain('unused-secret');
  });

  it('reports a remote Ollama endpoint as remote rather than claiming local processing', () => {
    expect(
      disclosure({
        LLM_PROVIDER: 'ollama',
        OLLAMA_URL: 'https://models.example.invalid',
      }).model.transport,
    ).toBe('network');
  });

  it('matches explicit OpenAI routing and strips credentials, paths and query strings from disclosure', () => {
    const value = disclosure({
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'secret-key',
      OPENAI_BASE_URL:
        'https://user:password@models.example.invalid/v1?credential=secret',
    });
    expect(value.model).toEqual({
      provider: 'openai',
      transport: 'network',
      endpointHost: 'models.example.invalid',
    });
    for (const secret of ['secret-key', 'password', 'credential'])
      expect(JSON.stringify(value)).not.toContain(secret);
  });

  it('reflects the runtime fallback when a bare config requests OpenAI without a key', () => {
    expect(
      disclosure({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: '' }).model.provider,
    ).toBe('ollama');
  });

  it('separates sign-in setup from tool authorization and exposes only requested scopes', () => {
    const value = disclosure(
      { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'private-secret' },
      true,
    );
    expect(value.google.signInConfigured).toBe(true);
    expect(value.google.toolsConfigured).toBe(true);
    expect(value.google.requestedScopes).toContain(
      'https://www.googleapis.com/auth/gmail.send',
    );
    expect(JSON.stringify(value)).not.toContain('private-secret');
    expect(disclosure({}, true).google.toolsConfigured).toBe(false);
  });
});
