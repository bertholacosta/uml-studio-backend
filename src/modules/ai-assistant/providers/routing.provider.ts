import { Logger } from '@nestjs/common';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiProvider,
  AiProviderUnavailableError,
} from './ai-provider';

/**
 * Une varios proveedores en uno: «Configurar Trazo» muestra los modelos de todos y cada
 * petición va al proveedor del modelo elegido. Las imágenes van siempre al principal.
 * Si el proveedor elegido no está disponible (p. ej. el túnel de Kaggle caído o DeepSeek
 * saturado), la petición de texto se reintenta con los demás para que Trazo siga respondiendo.
 */
export class RoutingProvider implements AiProvider {
  private readonly logger = new Logger(RoutingProvider.name);

  constructor(
    private readonly primary: AiProvider,
    private readonly others: AiProvider[],
  ) {}

  models(): string[] {
    return [
      ...new Set([
        ...this.primary.models(),
        ...this.others.flatMap((p) => p.models()),
      ]),
    ];
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const hasImage = request.parts.some((part) => 'inlineData' in part);
    if (hasImage) return this.primary.generate(request);

    const chosen =
      (request.model &&
        [this.primary, ...this.others].find((p) =>
          p.models().includes(request.model!),
        )) ||
      this.primary;
    const order = [
      chosen,
      ...[this.primary, ...this.others].filter((p) => p !== chosen),
    ];

    let lastError: unknown;
    for (const [index, provider] of order.entries()) {
      try {
        // El modelo pedido solo vale para su proveedor; los de respaldo usan el suyo
        return await provider.generate(
          index === 0 ? request : { ...request, model: undefined },
        );
      } catch (error) {
        if (!(error instanceof AiProviderUnavailableError)) throw error;
        lastError = error;
        if (index < order.length - 1) {
          this.logger.warn(
            `${provider.models()[0]} no disponible (${error.message}); se usa ${order[index + 1].models()[0]}`,
          );
        }
      }
    }
    throw lastError;
  }
}
