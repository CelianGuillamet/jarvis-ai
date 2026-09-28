import { Injectable, BadRequestException } from '@nestjs/common';
import { OAuthStateService } from './oauth-state.service';
import { GoogleOAuthClientService } from './google-oauth-client.service';
import { GoogleCredentialService } from './google-credential.service';
import { GOOGLE_AUTH_SCOPES } from './google-scopes';
import { Auth } from 'googleapis';

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly oauthClients: GoogleOAuthClientService,
    private readonly credentials: GoogleCredentialService,
    private readonly state: OAuthStateService,
  ) {}

  async getAuthUrl(
    conversationId: string,
    ownerId: string,
    authSessionId: string,
  ) {
    try {
      const oauth2 = this.oauthClients.createOAuthClient();
      const pending = await this.state.create({
        conversationId,
        ownerId,
        authSessionId,
      });
      return oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['openid', ...GOOGLE_AUTH_SCOPES],
        include_granted_scopes: true,
        state: pending.state,
        nonce: pending.nonce,
        code_challenge: pending.codeChallenge,
        code_challenge_method: Auth.CodeChallengeMethod.S256,
      });
    } catch {
      throw new BadRequestException('Connexion Google indisponible.');
    }
  }

  async handleCallback(
    code: string,
    state: string,
    ownerId: string,
    authSessionId: string,
  ) {
    if (typeof code !== 'string' || !code.trim() || typeof state !== 'string')
      throw new BadRequestException('Retour OAuth invalide.');
    const pending = await this.state.consume(state, ownerId, authSessionId);
    if (!pending) throw new BadRequestException('State OAuth invalide/expiré');
    try {
      const oauth2 = this.oauthClients.createOAuthClient();
      const { tokens } = await oauth2.getToken({
        code,
        codeVerifier: pending.verifier,
      });
      if (!tokens.id_token) throw new Error('Missing provider identity.');
      const ticket = await oauth2.verifyIdToken({
        idToken: tokens.id_token,
        audience: oauth2._clientId,
      });
      const identity = ticket.getPayload();
      if (
        !identity?.sub ||
        (identity as typeof identity & { nonce?: string }).nonce !==
          pending.nonce
      )
        throw new Error('Invalid provider identity.');
      await this.credentials.save(
        ownerId,
        identity.sub,
        pending.conversationId,
        tokens,
        pending.digest,
      );
      return pending.conversationId;
    } catch {
      // Provider errors may contain codes, credentials or request configuration.
      throw new BadRequestException(
        'Connexion Google impossible. Recommence la connexion.',
      );
    }
  }

  async status(conversationId: string) {
    return this.oauthClients.getConnectionStatus(conversationId);
  }

  async disconnect(ownerId: string) {
    const credentials = await this.credentials.disconnect(ownerId);
    if (!credentials) return { connected: false, revocationPending: false };
    if (!credentials.refresh_token)
      return { connected: false, revocationPending: true };
    try {
      await this.oauthClients
        .createOAuthClient()
        .revokeToken(credentials.refresh_token);
      return { connected: false, revocationPending: false };
    } catch {
      // Local access is already removed. The user can finish revocation at Google.
      return { connected: false, revocationPending: true };
    }
  }
}
