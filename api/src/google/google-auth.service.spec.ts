import { BadRequestException } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleOAuthClientService } from './google-oauth-client.service';
import type { GoogleCredentialService } from './google-credential.service';
import type { OAuthStateService } from './oauth-state.service';

function fixture() {
  const tokens = {
    refresh_token: 'refresh-secret',
    id_token: 'identity-secret',
  };
  const client = {
    _clientId: 'fixture-client',
    generateAuthUrl: jest
      .fn()
      .mockReturnValue('https://accounts.google.com/authorize'),
    getToken: jest.fn().mockResolvedValue({ tokens }),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({ sub: 'google-subject', nonce: 'nonce' }),
    }),
    revokeToken: jest.fn().mockResolvedValue({}),
  };
  const oauth = {
    createOAuthClient: jest.fn(() => client),
    getConnectionStatus: jest.fn(),
  };
  const credentials = {
    save: jest.fn(),
    disconnect: jest
      .fn()
      .mockResolvedValue({ refresh_token: 'refresh-secret' }),
  };
  const state = {
    create: jest.fn().mockResolvedValue({
      state: 'state',
      nonce: 'nonce',
      codeChallenge: 'challenge',
    }),
    consume: jest.fn().mockResolvedValue({
      conversationId: 'conversation',
      digest: 'claimed-digest',
      nonce: 'nonce',
      verifier: 'verifier',
    }),
  };
  return {
    client,
    credentials,
    state,
    service: new GoogleAuthService(
      oauth as unknown as GoogleOAuthClientService,
      credentials as unknown as GoogleCredentialService,
      state as unknown as OAuthStateService,
    ),
  };
}

describe('GoogleAuthService', () => {
  it('returns a safe error when authorization configuration is unavailable', async () => {
    const { service, state } = fixture();
    state.create.mockRejectedValueOnce(new Error('sensitive-configuration'));
    await expect(
      service.getAuthUrl('conversation', 'owner', 'login-session'),
    ).rejects.toThrow('Connexion Google indisponible.');
  });

  it('binds authorization to the owner and authenticated session with PKCE and nonce', async () => {
    const { service, state, client } = fixture();
    await service.getAuthUrl('conversation', 'owner', 'login-session');
    expect(state.create).toHaveBeenCalledWith({
      conversationId: 'conversation',
      ownerId: 'owner',
      authSessionId: 'login-session',
    });
    expect(client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'state',
        nonce: 'nonce',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      }),
    );
  });

  it('rejects an unavailable claim before accessing the provider or credentials', async () => {
    const { service, state, client, credentials } = fixture();
    state.consume.mockResolvedValueOnce(null);
    await expect(
      service.handleCallback('code', 'state', 'other-owner', 'other-session'),
    ).rejects.toThrow(BadRequestException);
    expect(state.consume).toHaveBeenCalledWith(
      'state',
      'other-owner',
      'other-session',
    );
    expect(client.getToken).not.toHaveBeenCalled();
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it('requires verified provider identity and saves only to the claimed account', async () => {
    const { service, client, credentials } = fixture();
    await expect(
      service.handleCallback('code', 'state', 'owner', 'login-session'),
    ).resolves.toBe('conversation');
    expect(client.getToken).toHaveBeenCalledWith({
      code: 'code',
      codeVerifier: 'verifier',
    });
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'identity-secret',
      audience: 'fixture-client',
    });
    expect(credentials.save).toHaveBeenCalledWith(
      'owner',
      'google-subject',
      'conversation',
      expect.objectContaining({ refresh_token: 'refresh-secret' }),
      'claimed-digest',
    );
  });

  it('rejects nonce mismatch and redacts provider failures', async () => {
    const { service, client, credentials } = fixture();
    client.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'google-subject', nonce: 'other-nonce' }),
    });
    await expect(
      service.handleCallback('code', 'state', 'owner', 'login-session'),
    ).rejects.toThrow('Connexion Google impossible.');
    expect(credentials.save).not.toHaveBeenCalled();
    client.getToken.mockRejectedValueOnce(new Error('SECRET_ACCESS_TOKEN'));
    await expect(
      service.handleCallback('code', 'state', 'owner', 'login-session'),
    ).rejects.toThrow('Connexion Google impossible.');
  });

  it('revokes after local disconnect and reports a provider failure without restoring access', async () => {
    const { service, credentials, client } = fixture();
    await expect(service.disconnect('owner')).resolves.toEqual({
      connected: false,
      revocationPending: false,
    });
    expect(credentials.disconnect).toHaveBeenCalledWith('owner');
    expect(client.revokeToken).toHaveBeenCalledWith('refresh-secret');
    client.revokeToken.mockRejectedValueOnce(new Error('SECRET_REFRESH_TOKEN'));
    await expect(service.disconnect('owner')).resolves.toEqual({
      connected: false,
      revocationPending: true,
    });
  });
});
