import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiProvider,
  AiProviderUnavailableError,
} from './ai-provider';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'trazo';
// Un modelo propio tarda más que una API en la nube, sobre todo si su servidor estaba apagado
const DEFAULT_TIMEOUT_MS = 180_000;

interface OllamaChatResponse {
  model: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/**
 * Modelo open-source servido con Ollama (API nativa /api/chat).
 * El servidor puede ser el propio equipo, un servidor controlado por el equipo, una GPU sin
 * servidor en Modal (ollama/modal_app.py) o un cuaderno de Google Colab expuesto con un
 * túnel: basta con cambiar OLLAMA_BASE_URL.
 * Con un esquema JSON en la petición, Ollama restringe la salida a ese esquema
 * (salida estructurada), lo que hace fiables las respuestas de modelos pequeños.
 */
@Injectable()
export class OllamaProvider implements AiProvider {
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly visionModel?: string;
  private readonly authHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly numCtx?: number;
  private readonly keepAlive: string;
  private readonly think?: boolean;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('OLLAMA_BASE_URL') || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.model = config.get<string>('OLLAMA_MODEL') || DEFAULT_MODEL;
    this.visionModel = config.get<string>('OLLAMA_VISION_MODEL') || undefined;
    const apiKey = config.get<string>('OLLAMA_API_KEY');
    const modalKey = config.get<string>('MODAL_KEY');
    const modalSecret = config.get<string>('MODAL_SECRET');
    this.authHeaders = {
      // Proxy propio con token
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      // Tokens de proxy de Modal: sin ellos Modal rechaza la petición
      ...(modalKey && modalSecret
        ? { 'Modal-Key': modalKey, 'Modal-Secret': modalSecret }
        : {}),
    };
    this.timeoutMs =
      Number(config.get<string>('AI_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
    this.numCtx = Number(config.get<string>('OLLAMA_NUM_CTX')) || undefined;
    // Mantiene el modelo cargado en la GPU entre preguntas
    this.keepAlive = config.get<string>('OLLAMA_KEEP_ALIVE') || '30m';
    const think = config.get<string>('OLLAMA_THINK');
    this.think = think === undefined ? undefined : think === 'true';

    this.logger.log(
      `Ollama en ${this.baseUrl}, modelo: ${this.model}${this.visionModel ? `, visión: ${this.visionModel}` : ''}`,
    );
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const images = request.parts.flatMap((part) =>
      'inlineData' in part ? [part.inlineData.data] : [],
    );
    const text = request.parts
      .flatMap((part) => ('text' in part ? [part.text] : []))
      .join('\n\n');

    if (images.length && !this.visionModel) {
      throw new Error(
        'El modelo local no lee imágenes: define OLLAMA_VISION_MODEL o AI_VISION_PROVIDER=gemini',
      );
    }
    const model = images.length ? this.visionModel! : this.model;

    const body = {
      model,
      stream: false,
      keep_alive: this.keepAlive,
      messages: [
        { role: 'system', content: request.systemInstruction },
        ...(request.history || []).map((turn) => ({
          role: turn.role,
          content: turn.text,
        })),
        {
          role: 'user',
          content: text,
          ...(images.length ? { images } : {}),
        },
      ],
      ...(request.schema
        ? { format: request.schema }
        : request.json
          ? { format: 'json' }
          : {}),
      ...(this.think === undefined ? {} : { think: this.think }),
      options: {
        temperature: request.json ? 0.2 : 0.4,
        ...(this.numCtx ? { num_ctx: this.numCtx } : {}),
      },
    };

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: any) {
      // Servidor apagado, túnel caído o tiempo agotado
      throw new AiProviderUnavailableError(
        `El servidor de IA (${this.baseUrl}) no respondió: ${error?.cause?.code || error?.name || error?.message}`,
        error,
      );
    }

    const data = (await response
      .json()
      .catch(() => ({}))) as OllamaChatResponse;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `El servidor de IA rechazó las credenciales (HTTP ${response.status}): revisa MODAL_KEY y MODAL_SECRET u OLLAMA_API_KEY`,
        );
      }
      if (response.status === 404) {
        throw new Error(
          `El servidor de IA no tiene el modelo «${model}». Créalo con: ollama create ${model} -f ollama/Modelfile (o descárgalo con ollama pull)`,
        );
      }
      if (response.status >= 500 || response.status === 429) {
        throw new AiProviderUnavailableError(
          `Ollama respondió HTTP ${response.status}: ${data.error || ''}`,
        );
      }
      throw new Error(
        `Ollama respondió HTTP ${response.status}: ${data.error || ''}`,
      );
    }

    const latencyMs = Date.now() - started;
    this.logger.log(
      `${data.model || model} respondió en ${latencyMs} ms (${data.prompt_eval_count ?? '?'} → ${data.eval_count ?? '?'} tokens)`,
    );
    return {
      text: data.message?.content || '',
      model: data.model || model,
      latencyMs,
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
    };
  }
}
