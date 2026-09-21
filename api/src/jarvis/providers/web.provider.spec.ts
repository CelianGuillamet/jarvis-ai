import { DisabledWebProvider, WEB_DISABLED_MESSAGE } from './web.provider';

describe('DisabledWebProvider', () => {
  it('reports disabled capability and rejects all retrieval before fetch', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fetch'));
    try {
      const provider = new DisabledWebProvider();
      expect(provider.name).toBe('disabled');
      await expect(provider.search('news', 5)).rejects.toThrow(
        WEB_DISABLED_MESSAGE,
      );
      for (const url of [
        'https://example.com',
        'http://[::1]',
        'http://169.254.169.254/',
      ]) {
        await expect(provider.open(url)).rejects.toThrow(WEB_DISABLED_MESSAGE);
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
