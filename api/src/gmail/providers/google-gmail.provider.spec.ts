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

  it.each([
    null,
    {},
    { id: '' },
    { id: '  ' },
    { id: 12 },
    { id: 'sent', threadId: 12 },
  ])(
    'treats a missing receipt as uncertain and never resends: %j',
    async (data) => {
      send.mockResolvedValueOnce({ data });
      await expect(
        provider.sendMessage('conversation', payload),
      ).rejects.toThrow('La réponse de Gmail est invalide.');
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

describe('Gmail read boundaries', () => {
  const list = jest.fn();
  const get = jest.fn();
  const provider = new GoogleGmailProvider({
    createAuthorizedClient: jest.fn().mockResolvedValue({}),
  } as unknown as GoogleOAuthClientService);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(google.gmail).mockReturnValue({
      users: { messages: { list, get } },
    } as unknown as ReturnType<typeof google.gmail>);
  });

  it('fails invalid list entries before requesting metadata', async () => {
    list.mockResolvedValueOnce({ data: { messages: [{}] } });
    await expect(provider.listMessages('conversation')).rejects.toThrow(
      'La réponse de Gmail est invalide.',
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps legitimate empty results distinct from malformed responses', async () => {
    list.mockResolvedValueOnce({ data: {} });
    await expect(provider.listMessages('conversation')).resolves.toEqual([]);
    list.mockResolvedValueOnce({ data: null });
    await expect(provider.listMessages('conversation')).rejects.toThrow(
      'La réponse de Gmail est invalide.',
    );
  });

  it('uses the validated provider timestamp when the Date header is absent', async () => {
    list.mockResolvedValueOnce({ data: { messages: [{ id: 'message' }] } });
    get.mockResolvedValueOnce({
      data: {
        id: 'message',
        threadId: 'thread',
        internalDate: '1790812800000',
      },
    });
    const messages = await provider.listMessages('conversation');
    expect(messages[0].date.getTime()).toBe(1790812800000);
  });
});
