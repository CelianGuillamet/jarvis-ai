import { google } from 'googleapis';
import { GoogleGmailProvider } from './google-gmail.provider';
import type { GoogleOAuthClientService } from '../../google/google-oauth-client.service';

jest.mock('googleapis', () => ({ google: { gmail: jest.fn() } }));

describe('Gmail send receipts', () => {
  const send = jest.fn();
  const authorize = jest.fn().mockResolvedValue({});
  const provider = new GoogleGmailProvider({
    createAuthorizedClient: authorize,
  } as unknown as GoogleOAuthClientService);
  const payload = {
    to: 'fixture@example.invalid',
    subject: 'Fixture',
    text: 'Fixture',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(google.gmail).mockReturnValue({
      users: { messages: { send } },
    } as unknown as ReturnType<typeof google.gmail>);
  });

  it('returns the provider reference for durable follow-up without another send', async () => {
    send.mockResolvedValueOnce({
      data: { id: 'sent-123', threadId: 'thread-123' },
    });
    await expect(
      provider.sendMessage('conversation', payload),
    ).resolves.toEqual({ messageId: 'sent-123', threadId: 'thread-123' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledWith(
      'conversation',
      'GMAIL_NOT_CONNECTED',
    );
  });

  it.each([{}, { id: '' }, { id: '  ' }])(
    'treats a missing receipt as uncertain and never resends: %j',
    async (data) => {
      send.mockResolvedValueOnce({ data });
      await expect(
        provider.sendMessage('conversation', payload),
      ).rejects.toThrow('Référence du message envoyé indisponible');
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it('propagates an uncertain transport error without retrying', async () => {
    send.mockRejectedValueOnce(new Error('timeout'));
    await expect(provider.sendMessage('conversation', payload)).rejects.toThrow(
      'timeout',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});
