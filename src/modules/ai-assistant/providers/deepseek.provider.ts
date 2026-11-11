import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiProvider,
  AiProviderUnavailableError,
  temperatureOf,
} from './ai-provider';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODELS = 'deepseek-flash,deepseek-v4-pro';
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TOKENS = 8192;

interface ChatChunk {
  model?: string;
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/**
 * DeepSeek mediante su API compatible con OpenAI (/chat/completions).
 * Solo texto: DeepSeek no lee imágenes, así que la visión sigue en su propio proveedor.
 * Siempre en streaming, para que el texto llegue a medida que se escribe y ningún
 * intermediario corte una respuesta larga.
 */
export class DeepSeekProvider implements AiProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly selectable: string[];
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('DEEPSEEK_API_KEY') || '';
    this.baseUrl = (
      config.get<string>('DEEPSEEK_BASE_URL') || DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    // DEEPSEEK_MODELS: modelos que aparecen en «Configurar Trazo» (separados por comas)
    const models = (config.get<string>('DEEPSEEK_MODELS') || DEFAULT_MODELS)
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    this.selectable = models.length ? models : DEFAULT_MODELS.split(',');
    this.timeoutMs =
      Number(config.get<string>('AI_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
    this.maxTokens =
      Number(config.get<string>('DEEPSEEK_MAX_TOKENS')) || DEFAULT_MAX_TOKENS;
    this.logger.log(`DeepSeek listo, modelos: ${this.selectable.join(', ')}`);
  }

  /** Solo se activa si hay clave de API. */
  static isConfigured(config: ConfigService): boolean {
    return !!config.get<string>('DEEPSEEK_API_KEY');
  }

  models(): string[] {
    return this.selectable;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    if (request.parts.some((part) => 'inlineData' in part)) {
      throw new Error('DeepSeek no lee imágenes');
    }
    const model =
      request.model && this.selectable.includes(request.model)
        ? request.model
        : this.selectable[0];
    const text = request.parts
      .flatMap((part) => ('text' in part ? [part.text] : []))
      .join('\n\n');

    const body = {
      model,
      stream: true,
      stream_options: { include_usage: true },
      temperature: temperatureOf(request),
      max_tokens: this.maxTokens,
      messages: [
        { role: 'system', content: request.systemInstruction },
        ...(request.history || []).map((turn) => ({
          role: turn.role,
          content: turn.text,
        })),
        { role: 'user', content: text },
      ],
      // El modo JSON de DeepSeek exige que la instrucción mencione «JSON»: las de Trazo lo hacen
      ...(request.json || request.schema
        ? { response_format: { type: 'json_object' } }
        : {}),
    };

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: any) {
      throw new AiProviderUnavailableError(
        `DeepSeek no respondió: ${error?.cause?.code || error?.name || error?.message}`,
        error,
      );
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new Error(
          'DeepSeek rechazó la clave de API (HTTP 401): revisa DEEPSEEK_API_KEY',
        );
      }
      if (response.status === 402) {
        throw new Error('DeepSeek: saldo insuficiente en la cuenta (HTTP 402)');
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AiProviderUnavailableError(
          `DeepSeek respondió HTTP ${response.status}: ${detail.slice(0, 200)}`,
        );
      }
      throw new Error(
        `DeepSeek respondió HTTP ${response.status}: ${detail.slice(0, 200)}`,
      );
    }

    return this.readStream(response.body, model, started, request.onDelta);
  }

  /** Lee los eventos SSE («data: {...}») y entrega cada trozo de texto al llegar. */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    model: string,
    started: number,
    onDelta?: (chunk: string) => void,
  ): Promise<AiGenerateResult> {
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage: ChatChunk['usage'];
    let modelUsed = model;
    const handle = (line: string) => {
      const data = line.trim();
      if (!data.startsWith('data:')) return;
      const payload = data.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      const chunk = JSON.parse(payload) as ChatChunk;
      modelUsed = chunk.model || modelUsed;
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        text += delta;
        onDelta?.(delta);
      }
      if (chunk.usage) usage = chunk.usage;
    };
    try {
      for await (const part of body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(part, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(handle);
      }
      handle(buffer + decoder.decode());
    } catch (error: any) {
      if (error instanceof SyntaxError) throw error;
      throw new AiProviderUnavailableError(
        `La respuesta de DeepSeek se cortó: ${error?.name || error?.message}`,
        error,
      );
    }

    const latencyMs = Date.now() - started;
    this.logger.log(
      `${modelUsed} respondió en ${latencyMs} ms (${usage?.prompt_tokens ?? '?'} → ${usage?.completion_tokens ?? '?'} tokens)`,
    );
    return {
      text: text.trim(),
      model: modelUsed,
      latencyMs,
      usage: {
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
      },
    };
  }
}
