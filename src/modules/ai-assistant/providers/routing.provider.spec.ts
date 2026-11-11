import { RoutingProvider } from './routing.provider';
import { AiProvider, AiProviderUnavailableError } from './ai-provider';

const fake = (models: string[]) => {
  const generate = jest.fn(async (req: any) => ({
    text: 'ok',
    model: req.model || models[0],
  }));
  return {
    provider: { models: () => models, generate } as AiProvider,
    generate,
  };
};

describe('RoutingProvider', () => {
  const text = { systemInstruction: 's', parts: [{ text: 'hola' }] };

  it('ofrece los modelos de todos los proveedores, el principal primero', () => {
    const local = fake(['trazo', 'qwen2.5-coder:7b']);
    const deepseek = fake(['deepseek-flash']);
    const router = new RoutingProvider(local.provider, [deepseek.provider]);
    expect(router.models()).toEqual([
      'trazo',
      'qwen2.5-coder:7b',
      'deepseek-flash',
    ]);
  });

  it('envía cada petición al proveedor del modelo elegido', async () => {
    const local = fake(['trazo']);
    const deepseek = fake(['deepseek-flash']);
    const router = new RoutingProvider(local.provider, [deepseek.provider]);

    await router.generate({ ...text, model: 'deepseek-flash' });
    expect(deepseek.generate).toHaveBeenCalledTimes(1);
    expect(local.generate).not.toHaveBeenCalled();

    await router.generate(text);
    expect(local.generate).toHaveBeenCalledTimes(1);
  });

  it('las imágenes van siempre al principal, aunque se haya elegido DeepSeek', async () => {
    const local = fake(['trazo']);
    const deepseek = fake(['deepseek-flash']);
    const router = new RoutingProvider(local.provider, [deepseek.provider]);

    await router.generate({
      ...text,
      model: 'deepseek-flash',
      parts: [{ inlineData: { mimeType: 'image/png', data: 'x' } }],
    });
    expect(local.generate).toHaveBeenCalledTimes(1);
    expect(deepseek.generate).not.toHaveBeenCalled();
  });

  it('si el elegido no está disponible, responde el otro con su propio modelo', async () => {
    const local = fake(['trazo']);
    local.generate.mockRejectedValueOnce(
      new AiProviderUnavailableError('túnel caído'),
    );
    const deepseek = fake(['deepseek-flash']);
    const router = new RoutingProvider(local.provider, [deepseek.provider]);

    const result = await router.generate({ ...text, model: 'trazo' });
    expect(result.model).toBe('deepseek-flash');
    expect(deepseek.generate.mock.calls[0][0].model).toBeUndefined();
  });

  it('un error que no es de disponibilidad no se oculta con el respaldo', async () => {
    const local = fake(['trazo']);
    const deepseek = fake(['deepseek-flash']);
    deepseek.generate.mockRejectedValueOnce(new Error('clave inválida'));
    const router = new RoutingProvider(local.provider, [deepseek.provider]);

    await expect(
      router.generate({ ...text, model: 'deepseek-flash' }),
    ).rejects.toThrow('clave inválida');
    expect(local.generate).not.toHaveBeenCalled();
  });
});
