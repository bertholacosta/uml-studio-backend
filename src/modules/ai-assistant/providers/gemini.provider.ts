import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiProvider,
  AiProviderUnavailableError,
} from './ai-provider';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
// Errores transitorios de Gemini: límite de cuota, error interno, saturación y timeout del servidor
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Google Gemini mediante @google/genai.
 * Usa Google AI Studio (GEMINI_API_KEY) o Vertex AI (GEMINI_USE_VERTEX=true o credenciales ADC).
 * Reintenta con espera exponencial los errores transitorios y, si se define
 * GEMINI_FALLBACK_MODEL, pasa a ese modelo cuando el principal sigue saturado.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI;
  private readonly models: string[];
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    const location = config.get<string>('GCP_LOCATION') || 'us-central1';
    const useVertex =
      config.get<string>('GEMINI_USE_VERTEX') === 'true' || !apiKey;

    this.client = apiKey
      ? new GoogleGenAI({
          apiKey,
          ...(useVertex ? { vertexai: true, location } : {}),
        })
      : new GoogleGenAI({
          vertexai: true,
          project: config.get<string>('GCP_PROJECT_ID'),
          location,
        });

    const primary = config.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;
    const fallback = config.get<string>('GEMINI_FALLBACK_MODEL');
    this.models =
      fallback && fallback !== primary ? [primary, fallback] : [primary];
    this.timeoutMs =
      Number(config.get<string>('AI_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;

    this.logger.log(
      `Gemini listo (${useVertex ? 'Vertex AI' : 'Google AI Studio'}), modelos: ${this.models.join(' → ')}`,
    );
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const contents = [
      ...(request.history || []).map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.text }],
      })),
      { role: 'user', parts: request.parts },
    ];

    let lastError: unknown;
    for (const model of this.models) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const started = Date.now();
          const response = await this.client.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: request.systemInstruction,
              ...(request.json ? { responseMimeType: 'application/json' } : {}),
              abortSignal: AbortSignal.timeout(this.timeoutMs),
            },
          });
          const latencyMs = Date.now() - started;
          this.logger.log(`${model} respondió en ${latencyMs} ms`);
          return {
            text: response.text || '',
            model,
            latencyMs,
            usage: {
              inputTokens: response.usageMetadata?.promptTokenCount,
              outputTokens: response.usageMetadata?.candidatesTokenCount,
            },
          };
        } catch (error: any) {
          lastError = error;
          if (!this.isTransient(error)) {
            throw error;
          }
          this.logger.warn(
            `${model} no disponible (intento ${attempt}/${MAX_ATTEMPTS}): ${this.describe(error)}`,
          );
          // Un timeout ya consumió todo el plazo: no se repite con el mismo modelo
          if (this.isTimeout(error)) break;
          if (attempt < MAX_ATTEMPTS) {
            await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 300);
          }
        }
      }
    }

    throw new AiProviderUnavailableError(
      'Gemini está saturado o no respondió a tiempo',
      lastError,
    );
  }

  private isTransient(error: any): boolean {
    return RETRYABLE_STATUS.has(error?.status) || this.isTimeout(error);
  }

  private isTimeout(error: any): boolean {
    return error?.name === 'TimeoutError' || error?.name === 'AbortError';
  }

  private describe(error: any): string {
    return error?.status
      ? `HTTP ${error.status}`
      : error?.message || String(error);
  }
}
