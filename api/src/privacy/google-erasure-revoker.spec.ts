import { GoogleErasureRevoker } from './google-erasure-revoker';

describe('Google erasure revocation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the token only in a POST body, with timeout and redirects forbidden', async () => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    expect(await new GoogleErasureRevoker().revoke('private-token')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(options?.method).toBe('POST');
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect((options?.body as URLSearchParams).get('token')).toBe(
      'private-token',
    );
  });

  it.each([400, 429, 500])(
    'does not claim successful revocation for HTTP %s',
    async (status) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status }));
      expect(await new GoogleErasureRevoker().revoke('private-token')).toBe(
        false,
      );
    },
  );

  it('returns a retryable result for network failure and makes no call for an empty token', async () => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('sensitive provider detail'));
    expect(await new GoogleErasureRevoker().revoke('private-token')).toBe(
      false,
    );
    expect(await new GoogleErasureRevoker().revoke('')).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
