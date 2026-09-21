import { OllamaProvider } from './ollama.provider';

describe('Ollama response validation', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [{ message: { content: 'Hello' } }, 'Hello'],
    [{ message: {} }, ''],
    [{}, ''],
    [null, ''],
  ])('reads only supported text content', async (payload, expected) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(new OllamaProvider().chat([])).resolves.toBe(expected);
  });

  it('rejects structured content instead of returning it as text', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"message":{"content":{"bad":true}}}'));
    await expect(new OllamaProvider().chat([])).rejects.toThrow(
      'non-text message content',
    );
  });
});
