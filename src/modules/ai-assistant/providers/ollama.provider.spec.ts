import { ConfigService } from '@nestjs/config';
import { OllamaProvider } from './ollama.provider';
import { AiProviderUnavailableError } from './ai-provider';

const config = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/** Respuesta en streaming de Ollama: líneas JSON cortadas en trozos arbitrarios. */
const ndjson = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks)
          controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    { status: 200 },
  );

describe('OllamaProvider', () => {
  const fetchMock = jest.fn();
  const request = { systemInstruction: 'sys', parts: [{ text: 'hola' }] };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sin onDelta también usa streaming (evita cortes de túneles) y junta el texto completo', async () => {
    fetchMock.mockResolvedValueOnce(
      ndjson([
        JSON.stringify({
          model: 'trazo',
          message: { content: '{"reply":' },
          done: false,
        }) + '\n',
        JSON.stringify({
          model: 'trazo',
          message: { content: '"hola"}' },
          done: true,
          eval_count: 5,
        }) + '\n',
      ]),
    );
    const result = await new OllamaProvider(config()).generate(request);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ stream: true, options: { num_ctx: 8192 } });
    expect(result).toMatchObject({ text: '{"reply":"hola"}', model: 'trazo' });
  });

  it('con onDelta entrega cada trozo al llegar, aunque las líneas vengan cortadas', async () => {
    const lines = [
      { model: 'trazo', message: { content: '{"reply":"Ana, ' }, done: false },
      { model: 'trazo', message: { content: 'listo"}' }, done: false },
      {
        model: 'trazo',
        message: { content: '' },
        done: true,
        prompt_eval_count: 3400,
        eval_count: 12,
      },
    ]
      .map((l) => JSON.stringify(l))
      .join('\n');
    const cut = lines.indexOf('listo') - 3;
    fetchMock.mockResolvedValueOnce(
      ndjson([lines.slice(0, cut), lines.slice(cut)]),
    );
    const deltas: string[] = [];

    const result = await new OllamaProvider(config()).generate({
      ...request,
      onDelta: (chunk) => deltas.push(chunk),
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    expect(deltas).toEqual(['{"reply":"Ana, ', 'listo"}']);
    expect(result).toMatchObject({
      text: '{"reply":"Ana, listo"}',
      model: 'trazo',
      usage: { inputTokens: 3400, outputTokens: 12 },
    });
  });

  it('una respuesta cortada a mitad avisa de que el servidor no está disponible', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                '{"model":"trazo","message":{"content":"{"}}\n',
              ),
            );
            controller.error(new Error('socket hang up'));
          },
        }),
      ),
    );
    await expect(
      new OllamaProvider(config()).generate({ ...request, onDelta: () => {} }),
    ).rejects.toThrow(AiProviderUnavailableError);
  });
});
