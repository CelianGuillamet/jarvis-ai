import { OpenAIProvider } from './openai.provider';
import { InvalidModelResponseError } from './model-response';

describe('OpenAI response validation without live calls', () => {
  afterEach(() => jest.restoreAllMocks());
  const completion = (content: unknown, finish_reason = 'stop') => ({
    choices: [{ finish_reason, message: { content } }],
  });
  it.each([
    'Bonjour',
    [
      { type: 'text', text: 'Bon' },
      { type: 'text', text: 'jour' },
    ],
  ])('reads valid completion content', async (content) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(completion(content))));
    await expect(new OpenAIProvider('fixture').chat([])).resolves.toBe(
      'Bonjour',
    );
  });
  it.each([
    null,
    {},
    completion(''),
    completion(12),
    completion('partial', 'length'),
    completion([{ type: 'text', text: 12 }]),
  ])(
    'fails invalid output without issuing a fallback request',
    async (payload) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(payload)));
      await expect(
        new OpenAIProvider('fixture').chat([]),
      ).rejects.toBeInstanceOf(InvalidModelResponseError);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('uses responses only for a supported endpoint incompatibility', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [
              { type: 'reasoning' },
              {
                type: 'message',
                status: 'completed',
                content: [{ type: 'output_text', text: 'Bonjour' }],
              },
            ],
          }),
        ),
      );
    await expect(new OpenAIProvider('fixture').chat([])).resolves.toBe(
      'Bonjour',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('/responses');
  });
  it.each([
    { status: 'incomplete', output_text: 'partial' },
    { status: 'completed', output: [] },
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text', text: 12 }],
        },
      ],
    },
  ])('rejects malformed responses envelopes', async (payload) => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    await expect(new OpenAIProvider('fixture').chat([])).rejects.toBeInstanceOf(
      InvalidModelResponseError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed JSON as an invalid response', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"broken":'));
    await expect(new OpenAIProvider('fixture').chat([])).rejects.toBeInstanceOf(
      InvalidModelResponseError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
