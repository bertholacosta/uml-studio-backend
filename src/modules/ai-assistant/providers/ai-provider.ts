import { ConfigService } from '@nestjs/config';

/**
 * Contrato común de los proveedores de IA de Trazo.
 *
 * El asistente solo depende de esta interfaz, así que añadir otro proveedor
 * (Amazon Bedrock, un servidor compatible con OpenAI, etc.) consiste en
 * implementarla y registrarla en ai-assistant.module.ts.
 */
/** Proveedor de la conversación y la edición por texto (AI_PROVIDER: ollama o gemini). */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
/** Proveedor que lee imágenes (AI_VISION_PROVIDER; por defecto, el mismo que AI_PROVIDER). */
export const AI_VISION_PROVIDER = Symbol('AI_VISION_PROVIDER');

export type AiPart =
  { text: string } | { inlineData: { mimeType: string; data: string } };

/** Turno previo de la conversación con el usuario. */
export interface AiTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiGenerateRequest {
  systemInstruction: string;
  parts: AiPart[];
  history?: AiTurn[];
  /** Pide al modelo una respuesta JSON. */
  json?: boolean;
  /** Esquema JSON que debe cumplir la respuesta (salida estructurada), si el proveedor lo admite. */
  schema?: Record<string, unknown>;
  /** Temperatura (creatividad); por defecto 0,2 para JSON y 0,4 para texto. */
  temperature?: number;
  /** Modelo elegido por el equipo; se ignora si no está entre los de models(). */
  model?: string;
  /**
   * Recibe el texto a medida que el modelo lo escribe (respuesta en streaming), para mostrar a
   * Trazo escribiendo en tiempo real. El proveedor que no lo admite responde todo al final.
   */
  onDelta?: (chunk: string) => void;
}

export interface AiGenerateResult {
  text: string;
  model: string;
  latencyMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AiProvider {
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
  /** Modelos que el equipo puede elegir en «Configurar Trazo»; el primero es el predeterminado. */
  models(): string[];
}

/** Temperatura de una petición: la pedida o la de siempre según el tipo de respuesta. */
export function temperatureOf(request: AiGenerateRequest): number {
  return request.temperature ?? (request.json ? 0.2 : 0.4);
}

/**
 * Modelos elegibles: el principal del proveedor y los de AI_MODELS (separados por comas), que
 * deben existir en el servidor (p. ej. trazo,qwen2.5-coder:7b en Ollama).
 */
export function selectableModels(
  config: ConfigService,
  primary: string,
): string[] {
  const extra = (config.get<string>('AI_MODELS') || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...extra])];
}

/** El proveedor está saturado o no responde a tiempo: conviene reintentar más tarde. */
export class AiProviderUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AiProviderUnavailableError';
  }
}
