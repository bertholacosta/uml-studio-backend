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
}

export interface AiGenerateResult {
  text: string;
  model: string;
  latencyMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AiProvider {
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
}

/** El proveedor está saturado o no responde a tiempo: conviene reintentar más tarde. */
export class AiProviderUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AiProviderUnavailableError';
  }
}
