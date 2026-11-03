import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { AiProviderUnavailableError } from './ai-provider';

const generateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest
    .fn()
    .mockImplementation(() => ({ models: { generateContent } })),
}));

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

describe('GeminiProvider', () => {
  const request = {
    systemInstruction: 'sys',
    parts: [{ text: 'hola' }],
    json: true,
  };

  const createProvider = (env: Record<string, string>) =>
    new GeminiProvider({
      get: (key: string) => env[key],
    } as unknown as ConfigService);

  beforeEach(() => {
    generateContent.mockReset();
    // Las esperas entre reintentos se resuelven al instante
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reintenta los errores 503 y devuelve la respuesta cuando el modelo se recupera', async () => {
    generateContent
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce({ text: '{"ok":true}' });
    const provider = createProvider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'flash',
    });

    await expect(provider.generate(request)).resolves.toMatchObject({
      text: '{"ok":true}',
      model: 'flash',
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('pasa al modelo de respaldo cuando el principal sigue saturado', async () => {
    generateContent.mockImplementation(({ model }) =>
      model === 'flash'
        ? Promise.reject(httpError(503))
        : Promise.resolve({ text: '{}' }),
    );
    const provider = createProvider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'flash',
      GEMINI_FALLBACK_MODEL: 'lite',
    });

    await expect(provider.generate(request)).resolves.toMatchObject({
      text: '{}',
      model: 'lite',
    });
    expect(generateContent).toHaveBeenCalledTimes(4);
  });

  it('lanza AiProviderUnavailableError si ningún modelo responde', async () => {
    generateContent.mockRejectedValue(httpError(429));
    const provider = createProvider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'flash',
    });

    await expect(provider.generate(request)).rejects.toBeInstanceOf(
      AiProviderUnavailableError,
    );
  });

  it('no reintenta errores definitivos como una clave inválida', async () => {
    generateContent.mockRejectedValue(httpError(401));
    const provider = createProvider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'flash',
    });

    await expect(provider.generate(request)).rejects.toMatchObject({
      status: 401,
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('envía el historial con el rol «model» para las respuestas de Trazo', async () => {
    generateContent.mockResolvedValue({ text: '{}' });
    const provider = createProvider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'flash',
    });

    await provider.generate({
      ...request,
      history: [{ role: 'assistant', text: 'Listo' }],
    });
    expect(generateContent.mock.calls[0][0].contents).toEqual([
      { role: 'model', parts: [{ text: 'Listo' }] },
      { role: 'user', parts: [{ text: 'hola' }] },
    ]);
  });
});
