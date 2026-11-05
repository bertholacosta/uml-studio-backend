import { ConfigService } from '@nestjs/config';
import { BedrockProvider } from './bedrock.provider';
import { AiProviderUnavailableError } from './ai-provider';

describe('BedrockProvider', () => {
  let send: jest.Mock;

  const createProvider = (values: Record<string, string> = {}) => {
    const config = { get: (key: string) => values[key] } as ConfigService;
    const provider = new BedrockProvider(config);
    send = jest.fn();
    (provider as any).client = { send };
    return provider;
  };

  const awsError = (name: string) => Object.assign(new Error(name), { name });

  it('envía la instrucción y la conversación con turnos alternos y devuelve texto y tokens', async () => {
    const provider = createProvider({ BEDROCK_MODEL_ID: 'qwen.test' });
    send.mockResolvedValue({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: '{"reply":"Ana, ok"}' }],
        },
      },
      usage: { inputTokens: 120, outputTokens: 8 },
    });

    const result = await provider.generate({
      systemInstruction: 'Eres Trazo',
      history: [
        // Converse no admite empezar por el asistente ni dos turnos seguidos del mismo rol
        { role: 'assistant', text: 'Hola' },
        { role: 'user', text: 'Luis: crea Cliente' },
        { role: 'user', text: 'Ana: y Pedido' },
        { role: 'assistant', text: 'Listo' },
      ],
      parts: [{ text: '¿Qué es un atributo derivado?' }],
      json: true,
    });

    const input = send.mock.calls[0][0].input;
    expect(input.modelId).toBe('qwen.test');
    expect(input.system).toEqual([{ text: 'Eres Trazo' }]);
    expect(input.messages.map((m: any) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(input.messages[0].content).toEqual([
      { text: 'Luis: crea Cliente' },
      { text: 'Ana: y Pedido' },
    ]);
    expect(result).toMatchObject({
      text: '{"reply":"Ana, ok"}',
      model: 'qwen.test',
      usage: { inputTokens: 120, outputTokens: 8 },
    });
  });

  it('manda las imágenes como bloques binarios', async () => {
    const provider = createProvider();
    send.mockResolvedValue({
      output: { message: { content: [{ text: '{}' }] } },
    });

    await provider.generate({
      systemInstruction: 'x',
      parts: [
        { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } },
        { text: 'digitaliza' },
      ],
    });

    const [image] = send.mock.calls[0][0].input.messages[0].content;
    expect(image.image.format).toBe('png');
    expect(Buffer.from(image.image.source.bytes).toString()).toBe('hello');
  });

  it('trata la saturación de Bedrock como un fallo transitorio', async () => {
    const provider = createProvider();
    send.mockRejectedValue(awsError('ThrottlingException'));
    await expect(
      provider.generate({ systemInstruction: 'x', parts: [{ text: 'hola' }] }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it('explica el error cuando la cuenta no tiene acceso al modelo', async () => {
    const provider = createProvider();
    send.mockRejectedValue(awsError('AccessDeniedException'));
    await expect(
      provider.generate({ systemInstruction: 'x', parts: [{ text: 'hola' }] }),
    ).rejects.toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
  });
});
