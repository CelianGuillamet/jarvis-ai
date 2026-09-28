import type { Response } from 'express';
import type { ConversationService } from '../auth/conversation.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
const identity = {
  identity: { userId: 'user-1', sessionId: 'auth-session' },
} as AuthenticatedRequest;
import { GoogleAuthController } from './google-auth.controller';
import type { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthController callback', () => {
  it('returns static success markup without interpolating the session identity', async () => {
    const sessionId = '<img src=x onerror=alert(1)>';
    const handleCallback = jest.fn().mockResolvedValue(sessionId);
    const controller = new GoogleAuthController(
      {
        handleCallback,
      } as unknown as GoogleAuthService,
      {} as ConversationService,
    );
    const send = jest.fn();
    const status = jest.fn().mockReturnValue({ send });

    await controller.callback(
      'code',
      'state',
      {
        status,
      } as unknown as Response,
      identity,
    );

    expect(handleCallback).toHaveBeenCalledWith(
      'code',
      'state',
      'user-1',
      'auth-session',
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('Google connecté'),
    );
    expect(send).not.toHaveBeenCalledWith(expect.stringContaining(sessionId));
    expect(send).not.toHaveBeenCalledWith(
      expect.stringContaining('Scopes Calendar + Gmail accordés'),
    );
  });

  it('does not render a success page when callback verification fails', async () => {
    const controller = new GoogleAuthController(
      {
        handleCallback: jest.fn().mockRejectedValue(new Error('Invalid state')),
      } as unknown as GoogleAuthService,
      {} as ConversationService,
    );
    const status = jest.fn();

    await expect(
      controller.callback(
        'code',
        'state',
        { status } as unknown as Response,
        identity,
      ),
    ).rejects.toThrow('Invalid state');
    expect(status).not.toHaveBeenCalled();
  });
});
