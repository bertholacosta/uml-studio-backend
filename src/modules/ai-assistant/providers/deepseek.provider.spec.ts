import { ConfigService } from '@nestjs/config';
import { DeepSeekProvider } from './deepseek.provider';
import { AiProviderUnavailableError } from './ai-provider';

const config = (values: Record<string, string> = {}) =>
  ({
    get: (key: string) => ({ DEEPSEEK_API_KEY: 'k', ...values })[key],
  }) as unknown as ConfigService;

/** Respuesta SSE de la API compatible con OpenAI, cortada en trozos arbitrarios. */
const sse = (chunks: string[], status = 200) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks)
          controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    { status },
  );

const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

describe('DeepSeekProvider', () => {
  const fetchMock = jest.fn();
  const request = {
    systemInstruction: 'Responde en JSON',
    parts: [{ text: 'hola' }],
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('solo se activa con clave de API', () => {
    expect(DeepSeekProvider.isConfigured(config())).toBe(true);
    expect(DeepSeekProvider.isConfigured({ get: () => undefined } as any)).toBe(
      false,
    );
  });

  it('junta el texto del streaming, entrega cada trozo y pide JSON', async () => {
    const lines =
      event({
        model: 'deepseek-flash',
        choices: [{ delta: { content: '{"reply":' } }],
      }) +
      event({ choices: [{ delta: { content: '"hola"}' } }] }) +
      event({
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }) +
      'data: [DONE]\n\n';
    const cut = lines.indexOf('hola') - 2;
    fetchMock.mockResolvedValueOnce(
      sse([lines.slice(0, cut), lines.slice(cut)]),
    );
    const deltas: string[] = [];

    const result = await new DeepSeekProvider(config()).generate({
      ...request,
      json: true,
      onDelta: (d) => deltas.push(d),
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'deepseek-flash',
      stream: true,
      response_format: { type: 'json_object' },
    });
    expect(result).toMatchObject({
      text: '{"reply":"hola"}',
      model: 'deepseek-flash',
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    expect(deltas.join('')).toBe('{"reply":"hola"}');
  });

  it('usa el modelo elegido si es uno de DEEPSEEK_MODELS', async () => {
    fetchMock.mockResolvedValueOnce(sse(['data: [DONE]\n\n']));
    const provider = new DeepSeekProvider(
      config({ DEEPSEEK_MODELS: 'deepseek-v4-pro,deepseek-flash' }),
    );
    expect(provider.models()).toEqual(['deepseek-v4-pro', 'deepseek-flash']);

    await provider.generate({ ...request, model: 'deepseek-v4-pro' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      'deepseek-v4-pro',
    );
  });

  it('una clave inválida da un error claro, no «saturado»', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const error = await new DeepSeekProvider(config())
      .generate(request)
      .catch((e) => e);
    expect(error).not.toBeInstanceOf(AiProviderUnavailableError);
    expect(error.message).toMatch(/DEEPSEEK_API_KEY/);
  });

  it('saturación o caída de red se marcan como no disponibles', async () => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 }));
    await expect(
      new DeepSeekProvider(config()).generate(request),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(
      new DeepSeekProvider(config()).generate(request),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it('rechaza imágenes sin llamar a la API', async () => {
    await expect(
      new DeepSeekProvider(config()).generate({
        ...request,
        parts: [{ inlineData: { mimeType: 'image/png', data: 'x' } }],
      }),
    ).rejects.toThrow(/imágenes/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
