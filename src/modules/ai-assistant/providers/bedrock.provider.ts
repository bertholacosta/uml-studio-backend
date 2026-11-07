import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseCommand,
  ConverseStreamCommand,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import {
  AiGenerateRequest,
  AiGenerateResult,
  AiProvider,
  AiProviderUnavailableError,
  selectableModels,
  temperatureOf,
} from './ai-provider';

const DEFAULT_MODEL = 'qwen.qwen3-32b-v1:0';
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 2048;
// Bedrock saturado o el modelo todavía cargando: conviene reintentar más tarde
const TRANSIENT_ERRORS = new Set([
  'ThrottlingException',
  'ServiceUnavailableException',
  'ModelNotReadyException',
  'ModelTimeoutException',
  'InternalServerException',
]);

/**
 * Modelos de Amazon Bedrock mediante la API Converse (p. ej. Qwen3 u otros modelos abiertos).
 * Credenciales: una clave de API de Bedrock en AWS_BEARER_TOKEN_BEDROCK (la lee el SDK) o, en
 * la EC2, el rol de la instancia. Bedrock no restringe la salida a un esquema como Ollama, así
 * que el JSON lo garantiza la instrucción del sistema y se valida al leer la respuesta.
 */
@Injectable()
export class BedrockProvider implements AiProvider {
  private readonly logger = new Logger(BedrockProvider.name);
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;
  private readonly selectable: string[];
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const region =
      config.get<string>('BEDROCK_REGION') ||
      config.get<string>('AWS_REGION') ||
      DEFAULT_REGION;
    this.model = config.get<string>('BEDROCK_MODEL_ID') || DEFAULT_MODEL;
    this.selectable = selectableModels(config, this.model);
    this.timeoutMs =
      Number(config.get<string>('AI_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
    this.client = new BedrockRuntimeClient({ region });

    this.logger.log(`Bedrock en ${region}, modelo: ${this.model}`);
  }

  models(): string[] {
    return this.selectable;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const model =
      request.model && this.selectable.includes(request.model)
        ? request.model
        : this.model;
    const content = request.parts.map((part): ContentBlock => {
      if ('text' in part) return { text: part.text };
      return {
        image: {
          format: this.imageFormat(part.inlineData.mimeType),
          source: { bytes: Buffer.from(part.inlineData.data, 'base64') },
        },
      };
    });
    const messages = this.alternate([
      ...(request.history || []).map((turn): Message => ({
        role: turn.role,
        content: [{ text: turn.text }],
      })),
      { role: 'user', content },
    ]);

    const started = Date.now();
    const input = {
      modelId: model,
      system: [{ text: request.systemInstruction }],
      messages,
      inferenceConfig: {
        temperature: temperatureOf(request),
        maxTokens: MAX_OUTPUT_TOKENS,
      },
    };
    const options = { abortSignal: AbortSignal.timeout(this.timeoutMs) };
    try {
      let text: string;
      let usage: { inputTokens?: number; outputTokens?: number } | undefined;
      if (request.onDelta) {
        // ConverseStream: el texto llega por partes (contentBlockDelta) y el uso al final
        const response = await this.client.send(
          new ConverseStreamCommand(input),
          options,
        );
        text = '';
        for await (const event of response.stream ?? []) {
          const delta = event.contentBlockDelta?.delta?.text;
          if (delta) {
            text += delta;
            request.onDelta(delta);
          }
          if (event.metadata?.usage) usage = event.metadata.usage;
          const failure =
            event.internalServerException ||
            event.modelStreamErrorException ||
            event.throttlingException ||
            event.serviceUnavailableException ||
            event.validationException;
          if (failure) throw failure;
        }
        text = text.trim();
      } else {
        const response = await this.client.send(
          new ConverseCommand(input),
          options,
        );
        // Solo los bloques de texto: los modelos con razonamiento añaden bloques aparte
        text = (response.output?.message?.content || [])
          .map((block) => block.text || '')
          .join('')
          .trim();
        usage = response.usage;
      }
      const latencyMs = Date.now() - started;
      this.logger.log(
        `${model} respondió en ${latencyMs} ms (${usage?.inputTokens ?? '?'} → ${usage?.outputTokens ?? '?'} tokens)`,
      );
      return {
        text,
        model,
        latencyMs,
        usage: {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        },
      };
    } catch (error: any) {
      if (
        TRANSIENT_ERRORS.has(error?.name) ||
        error?.name === 'TimeoutError' ||
        error?.name === 'AbortError'
      ) {
        throw new AiProviderUnavailableError(
          `Bedrock no respondió (${error?.name})`,
          error,
        );
      }
      if (error?.name === 'AccessDeniedException') {
        throw new Error(
          `Bedrock rechazó el acceso al modelo ${model}: revisa la clave de API (AWS_BEARER_TOKEN_BEDROCK) o los permisos de la cuenta. ${error?.message || ''}`,
        );
      }
      throw error;
    }
  }

  /** Converse exige turnos alternos que empiecen por el usuario: se unen los consecutivos. */
  private alternate(messages: Message[]): Message[] {
    const result: Message[] = [];
    for (const message of messages) {
      const last = result[result.length - 1];
      if (last?.role === message.role) {
        last.content = [...(last.content || []), ...(message.content || [])];
      } else if (result.length || message.role === 'user') {
        result.push({
          role: message.role,
          content: [...(message.content || [])],
        });
      }
    }
    return result;
  }

  private imageFormat(mimeType: string): 'png' | 'jpeg' | 'gif' | 'webp' {
    const subtype = mimeType.split('/')[1]?.toLowerCase();
    if (subtype === 'png' || subtype === 'gif' || subtype === 'webp') {
      return subtype;
    }
    return 'jpeg';
  }
}
