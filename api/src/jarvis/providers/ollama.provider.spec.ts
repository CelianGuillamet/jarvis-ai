import { OllamaProvider } from './ollama.provider';
import { InvalidModelResponseError } from './model-response';

describe('Ollama response validation', () => {
  afterEach(() => jest.restoreAllMocks());
  it('reads completed nonempty text', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ done: true, message: { content: 'Bonjour' } }),
        ),
      );
    await expect(new OllamaProvider().chat([])).resolves.toBe('Bonjour');
  });
  it.each([
    null,
    {},
    { done: true, message: {} },
    { done: false, message: { content: 'partial' } },
    { done: true, done_reason: 'length', message: { content: 'partial' } },
    { done: true, message: { content: '  ' } },
    { done: true, message: { content: { bad: true } } },
  ])('rejects invalid or incomplete envelopes', async (payload) => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(new OllamaProvider().chat([])).rejects.toBeInstanceOf(
      InvalidModelResponseError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
