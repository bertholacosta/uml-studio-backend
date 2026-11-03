import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AI_USER_ID,
  AI_USER_NAME,
  CollaborationGateway,
} from '../../projects/gateways/collaboration.gateway';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { ProjectRole } from '../../projects/entities/project-role.enum';
import { AiPromptDto, AiVisionPromptDto } from '../dtos/ai-request.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';
import {
  ApplyProposalDto,
  ChatMessageDto,
  ConversationDto,
} from '../dtos/ai-chat.dto';
import {
  AI_PROVIDER,
  AI_VISION_PROVIDER,
  AiPart,
  AiProvider,
  AiProviderUnavailableError,
  AiTurn,
} from '../providers/ai-provider';
import {
  UML_VISION_INSTRUCTION,
  buildVisionPrompt,
} from '../prompts/uml.prompts';
import {
  MENTOR_RESPONSE_SCHEMA,
  SUMMARY_INSTRUCTION,
  buildMentorInstruction,
  buildMentorPrompt,
  buildSummaryPrompt,
  formatUserTurn,
} from '../prompts/mentor.prompts';
import { UmlClassNode, UmlConnection } from '../domain/uml-diagram.types';
import { findNodeFuzzy, normalizeForFuzzy } from '../domain/node-matching';
import { mergeNodesAndConnections } from '../domain/diagram-merger';
import {
  DiagramOperation,
  applyOperations,
  dropUnrequestedOperations,
  fixUnrequestedManyToMany,
} from '../domain/diagram-operations';
import { resolveManyToManyRelationships } from '../domain/many-to-many.resolver';
import {
  parseModelJson,
  sanitizeConnections,
  sanitizeNodes,
  withPositions,
} from '../domain/diagram-sanitizer';
import { AiConversationService } from '../conversation/ai-conversation.service';
import {
  AiConversationDocument,
  AiMessageDocument,
  ChatAuthor,
  ChatIntent,
} from '../conversation/ai-conversation.schema';

type NewMessage = Parameters<AiConversationService['addMessage']>[1];

/** Mensaje aceptado: ya está en la conversación y Trazo lo responderá cuando le toque. */
export interface SubmittedPrompt {
  userMessage: ChatMessageDto;
  result: Promise<AiResponseDto>;
}

/** Quien escribe a Trazo: el usuario autenticado. */
export interface ChatUser {
  id: string;
  fullName: string;
}

const TRAZO: ChatAuthor = { userId: AI_USER_ID, userName: AI_USER_NAME };
const INTENTS: ChatIntent[] = ['answer', 'edit', 'propose', 'clarify'];
// Las miniaturas que se guardan con el mensaje (las fotos completas no)
const MAX_STORED_IMAGE_CHARS = 400_000;

const ATTRIBUTE_OR_METHOD =
  /(?:atributos?|m[eé]todos?|campos?|propiedad(?:es)?)\b/i;
const DELETE_ALL = [
  /(?:elimina(?:r)?|borra(?:r)?)\s+(?:todas?\s+las?\s+(?:tablas|clases|entidades|nodos)|todo\s+el\s+diagrama|todo\s*$)/i,
  /(?:limpia(?:r)?|vac[ií]a(?:r)?)\s+(?:el\s+diagrama|el\s+lienzo|todo\s*$)/i,
  /^(?:delete\s+all(?:\s+tables)?|clear\s+diagram)$/i,
];
// Especificaciones técnicas concretas: con ellas nunca se pide aclaración
const STRUCTURAL_SPECS = [
  /(?:uuid|string|integer|long|double|float|boolean|bigdecimal|localdate|localdatetime|date|text|byte\[\]|:|->)/i,
  /(?:con\s+(?:atributos?|campos?|columnas?|id|nombre|name|email))/i,
];
const ADDITIVE_VISION =
  /(?:agrega|anade|añade|suma|complementa|integra|fusiona|combina)\b/i;

const UNAVAILABLE_MESSAGE =
  'no pude responder porque el servidor de IA no está disponible o está saturado. Vuelve a intentarlo en unos segundos.';

const firstName = (fullName: string) =>
  fullName.trim().split(/\s+/)[0] || fullName;

/** Garantiza que la respuesta se dirija a la persona por su nombre. */
function addressTo(name: string, text: string): string {
  const first = firstName(name);
  if (normalizeForFuzzy(text.slice(0, 60)).includes(normalizeForFuzzy(first)))
    return text;
  const lower = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(text)
    ? text[0].toLowerCase() + text.slice(1)
    : text;
  return `${first}, ${lower}`;
}

/**
 * Trazo en la pizarra compartida. Cada pregunta y cada respuesta se guarda en MongoDB y se
 * difunde a todos los colaboradores del diagrama; Trazo distingue quién le habla y puede
 * explicar, proponer cambios (que alguien aplica después) o editar el diagrama.
 * Las peticiones de un mismo diagrama se atienden en orden, una tras otra.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly summarizing = new Set<string>();

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(AI_VISION_PROVIDER) private readonly vision: AiProvider,
    private readonly collaborationGateway: CollaborationGateway,
    private readonly access: ProjectAccessService,
    private readonly conversations: AiConversationService,
  ) {}

  // --- Conversación compartida ---

  async getConversation(
    diagramId: string,
    user: ChatUser,
    limit = 60,
  ): Promise<ConversationDto> {
    await this.access.assertDiagramAccess(diagramId, user.id, 'read');
    const conversation = await this.conversations.getActive(
      diagramId,
      this.authorOf(user),
    );
    const { messages, hasMore } = await this.conversations.recentMessages(
      conversation,
      limit,
    );
    return this.conversations.toConversationDto(
      conversation,
      messages,
      hasMore,
    );
  }

  /** Empieza una conversación nueva para toda la pizarra (la anterior queda guardada). */
  async startConversation(
    diagramId: string,
    user: ChatUser,
  ): Promise<ConversationDto> {
    await this.access.assertDiagramAccess(diagramId, user.id, 'write');
    const { projectId } = await this.access.getDiagramContext(diagramId);
    const conversation = await this.conversations.startNew(
      diagramId,
      this.authorOf(user),
      projectId,
    );
    const dto = this.conversations.toConversationDto(conversation, [], false);
    this.collaborationGateway.emitToDiagram(
      diagramId,
      'ai_conversation_reset',
      dto,
    );
    return dto;
  }

  // --- Mensajes de texto: mentor y edición ---

  /**
   * Guarda y difunde el mensaje y pone la respuesta en la cola del diagrama. Devuelve al
   * instante: la respuesta de Trazo llega a todos por el socket (evento ai_message), así un
   * modelo lento o un servidor de IA que arranca en frío no bloquean la petición HTTP.
   */
  async submitTextPrompt(
    dto: AiPromptDto,
    user: ChatUser,
  ): Promise<SubmittedPrompt> {
    const role = await this.access.assertDiagramAccess(
      dto.diagramId,
      user.id,
      'read',
    );
    const canEdit = role !== ProjectRole.VIEWER;
    const receivedAt = Date.now();
    const prompt = dto.prompt.trim();

    const conversation = await this.conversations.getActive(
      dto.diagramId,
      this.authorOf(user),
    );
    const userMessage = await this.publish(conversation, {
      role: 'user',
      author: this.authorOf(user),
      text: prompt,
      clientId: dto.clientId,
    });

    const result = this.enqueue(dto.diagramId, user, async () => {
      const { nodes, connections } = this.currentDiagram(
        dto.diagramId,
        dto,
        receivedAt,
      );
      const result = await this.answerText(
        conversation,
        userMessage,
        user,
        canEdit,
        prompt,
        nodes,
        connections,
      );
      this.summarizeLater(conversation.id);
      return result;
    });
    return { userMessage: this.conversations.toDto(userMessage), result };
  }

  /** Como submitTextPrompt, pero espera la respuesta de Trazo. */
  async processTextPrompt(
    dto: AiPromptDto,
    user: ChatUser,
  ): Promise<AiResponseDto> {
    return (await this.submitTextPrompt(dto, user)).result;
  }

  private async answerText(
    conversation: AiConversationDocument,
    userMessage: AiMessageDocument,
    user: ChatUser,
    canEdit: boolean,
    prompt: string,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
  ): Promise<AiResponseDto> {
    const diagramId = conversation.diagramId;
    const reply = (fields: Omit<NewMessage, 'role' | 'author'>) =>
      this.publish(conversation, {
        role: 'assistant',
        author: TRAZO,
        replyTo: userMessage.id,
        ...fields,
        text: addressTo(user.fullName, fields.text),
      });

    // Vaciar el diagrama no necesita al modelo
    if (
      canEdit &&
      !ATTRIBUTE_OR_METHOD.test(prompt) &&
      DELETE_ALL.some((re) => re.test(prompt))
    ) {
      this.collaborationGateway.broadcastAiMutation(diagramId, [], []);
      const message = await reply({
        text: 'vacié el diagrama: eliminé todas las clases y relaciones.',
        intent: 'edit',
        changesSummary: 'Limpieza total del diagrama.',
        operations: [{ op: 'clear_diagram' }],
      });
      return {
        success: true,
        action: 'diagram_mutated',
        message: message.text,
        nodes: [],
        connections: [],
        changesSummary: 'Limpieza total del diagrama.',
        userMessage: this.conversations.toDto(userMessage),
        assistantMessage: this.conversations.toDto(message),
      };
    }

    // Bloquear los nodos que menciona la instrucción mientras Trazo trabaja
    const lockedIds = canEdit
      ? this.mentionedNodeIds(prompt, currentNodes)
      : [];
    this.collaborationGateway.lockNodesForAi(diagramId, lockedIds);

    try {
      const [context, diagramInfo] = await Promise.all([
        this.conversations.contextFor(conversation, userMessage.id),
        this.access.getDiagramContext(diagramId),
      ]);
      const generated = await this.ai.generate({
        systemInstruction: buildMentorInstruction(context.summary),
        history: this.toTurns(context.history),
        parts: [
          {
            text: buildMentorPrompt({
              speaker: user.fullName,
              canEdit,
              prompt,
              projectName: diagramInfo.projectName,
              diagramName: diagramInfo.diagramName,
              participants: this.collaborationGateway.connectedUsers(diagramId),
              nodes: currentNodes,
              connections: currentConnections,
            }),
          },
        ],
        json: true,
        schema: MENTOR_RESPONSE_SCHEMA,
      });
      const parsed = parseModelJson(generated.text);
      // Se corrigen antes de aplicarlas o guardarlas como propuesta
      const operations: DiagramOperation[] = Array.isArray(parsed.operations)
        ? fixUnrequestedManyToMany(parsed.operations, prompt)
        : [];
      let intent = this.intentOf(parsed, operations);
      // Con especificaciones concretas no se pide aclaración: se aplica lo que haya
      if (
        intent === 'clarify' &&
        operations.length &&
        STRUCTURAL_SPECS.some((re) => re.test(prompt))
      ) {
        intent = 'edit';
      }
      // Quien solo puede ver recibe la propuesta para que un editor la aplique
      if (intent === 'edit' && !canEdit) intent = 'propose';

      const text: string =
        parsed.reply || parsed.message || parsed.changesSummary || '';
      const modelInfo = {
        model: generated.model,
        latencyMs: generated.latencyMs,
        usage: generated.usage,
      };
      const common = {
        userMessage: this.conversations.toDto(userMessage),
        modelUsed: generated.model,
      };

      if (intent === 'edit') {
        const edited = this.applyModelEdit(
          parsed,
          operations,
          prompt,
          currentNodes,
          currentConnections,
        );
        const { nodes, connections } = this.finalize(
          edited.nodes,
          edited.connections,
        );
        this.collaborationGateway.broadcastAiMutation(
          diagramId,
          nodes,
          connections,
        );
        const changesSummary =
          parsed.changesSummary || 'Cambios aplicados al diagrama.';
        const message = await reply({
          text: text || 'apliqué los cambios al diagrama.',
          intent: 'edit',
          changesSummary,
          operations: operations as any[],
          ...modelInfo,
        });
        return {
          ...common,
          success: true,
          action: 'diagram_mutated',
          message: message.text,
          nodes,
          connections,
          changesSummary,
          assistantMessage: this.conversations.toDto(message),
        };
      }

      if (intent === 'propose' && operations.length) {
        const changesSummary = parsed.changesSummary || 'Cambios propuestos.';
        const message = await reply({
          text: text || 'te propongo estos cambios.',
          intent: 'propose',
          changesSummary,
          operations: operations as any[],
          proposal: { state: 'pending' },
          ...modelInfo,
        });
        return {
          ...common,
          success: true,
          action: 'proposal',
          message: message.text,
          nodes: currentNodes,
          connections: currentConnections,
          changesSummary,
          assistantMessage: this.conversations.toDto(message),
        };
      }

      const isClarification = intent === 'clarify';
      const message = await reply({
        text:
          text ||
          (isClarification
            ? '¿puedes concretar qué clase o atributos quieres cambiar? Por ejemplo: «Agrega la clase Factura con id, total y fecha».'
            : 'no tengo una respuesta para eso. ¿Puedes reformularlo?'),
        intent: isClarification ? 'clarify' : 'answer',
        status: isClarification ? 'clarification' : 'success',
        ...modelInfo,
      });
      return {
        ...common,
        success: !isClarification,
        action: isClarification ? 'clarification_required' : 'answer',
        message: message.text,
        nodes: currentNodes,
        connections: currentConnections,
        changesSummary: isClarification ? 'Aclaración requerida.' : '',
        assistantMessage: this.conversations.toDto(message),
      };
    } catch (err) {
      return this.failure(
        err,
        conversation,
        userMessage,
        user,
        currentNodes,
        currentConnections,
        'no pude procesar ese mensaje. Prueba a reformularlo.',
      );
    } finally {
      this.collaborationGateway.unlockNodesForAi(diagramId, lockedIds);
    }
  }

  // --- Propuestas ---

  /** Aplica al diagrama actual los cambios que Trazo propuso en un mensaje. */
  async applyProposal(
    messageId: string,
    dto: ApplyProposalDto,
    user: ChatUser,
  ): Promise<AiResponseDto> {
    const message = await this.conversations.findMessage(messageId);
    if (!message?.proposal || !message.operations?.length) {
      throw new NotFoundException('Propuesta no encontrada');
    }
    await this.access.assertDiagramAccess(message.diagramId, user.id, 'write');
    const receivedAt = Date.now();

    return this.enqueue(message.diagramId, user, async () => {
      const applied = await this.conversations.markProposalApplied(
        messageId,
        this.authorOf(user),
      );
      if (!applied) {
        throw new ConflictException('Esta propuesta ya se aplicó');
      }
      try {
        const current = this.currentDiagram(message.diagramId, dto, receivedAt);
        const result = applyOperations(
          current.nodes,
          current.connections,
          message.operations as unknown as DiagramOperation[],
        );
        if (result.skipped.length) {
          this.logger.warn(
            `Operaciones de la propuesta no aplicadas: ${result.skipped.join('; ')}`,
          );
        }
        const { nodes, connections } = this.finalize(
          result.nodes,
          result.connections,
        );
        this.collaborationGateway.broadcastAiMutation(
          message.diagramId,
          nodes,
          connections,
        );
        const dtoMessage = this.conversations.toDto(applied);
        this.collaborationGateway.emitToDiagram(
          message.diagramId,
          'ai_message',
          dtoMessage,
        );
        return {
          success: true,
          action: 'diagram_mutated',
          message: `${firstName(user.fullName)} aplicó la propuesta de Trazo.`,
          nodes,
          connections,
          changesSummary: applied.changesSummary || 'Propuesta aplicada.',
          assistantMessage: dtoMessage,
        };
      } catch (err) {
        await this.conversations.revertProposal(messageId);
        throw err;
      }
    });
  }

  // --- Imágenes ---

  /** Digitalización de una imagen; como submitTextPrompt, la respuesta llega por el socket. */
  async submitVisionDiagram(
    dto: AiVisionPromptDto,
    user: ChatUser,
  ): Promise<SubmittedPrompt> {
    await this.access.assertDiagramAccess(dto.diagramId, user.id, 'write');
    const receivedAt = Date.now();

    // El tipo MIME de un data URI tiene prioridad sobre el declarado
    const dataUri = dto.imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType = dataUri?.[1] || dto.mimeType;
    const data = dto.imageBase64
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s+/g, '');
    const image: AiPart = { inlineData: { mimeType, data } };

    const conversation = await this.conversations.getActive(
      dto.diagramId,
      this.authorOf(user),
    );
    const userMessage = await this.publish(conversation, {
      role: 'user',
      author: this.authorOf(user),
      text: dto.prompt?.trim() || 'Digitaliza el diagrama de esta imagen.',
      clientId: dto.clientId,
      image:
        dto.imageBase64.length <= MAX_STORED_IMAGE_CHARS
          ? `data:${mimeType};base64,${data}`
          : undefined,
    });

    const result = this.enqueue(dto.diagramId, user, async () => {
      const current = this.currentDiagram(dto.diagramId, dto, receivedAt);
      try {
        const generated = await this.vision.generate({
          systemInstruction: UML_VISION_INSTRUCTION,
          parts: [image, { text: buildVisionPrompt(dto.prompt) }],
          json: true,
        });
        const parsed = parseModelJson(generated.text);

        let extracted = resolveManyToManyRelationships(
          withPositions(parsed.nodes),
          parsed.connections || [],
        );
        if (
          current.nodes.length > 0 &&
          ADDITIVE_VISION.test(dto.prompt || '')
        ) {
          extracted = {
            ...extracted,
            ...mergeNodesAndConnections(
              current.nodes,
              current.connections,
              extracted.nodes,
              extracted.connections,
              dto.prompt || '',
            ),
          };
        }

        const nodes = sanitizeNodes(extracted.nodes);
        const connections = sanitizeConnections(extracted.connections, nodes);
        this.collaborationGateway.broadcastAiMutation(
          dto.diagramId,
          nodes,
          connections,
        );

        const changesSummary = `Digitalización completada: ${nodes.length} clases y ${connections.length} relaciones extraídas.`;
        const message = await this.publish(conversation, {
          role: 'assistant',
          author: TRAZO,
          replyTo: userMessage.id,
          text: addressTo(
            user.fullName,
            parsed.message ||
              `digitalicé ${nodes.length} clases y ${connections.length} relaciones desde la imagen.`,
          ),
          intent: 'vision',
          changesSummary,
          model: generated.model,
          latencyMs: generated.latencyMs,
          usage: generated.usage,
        });
        return {
          success: true,
          action: 'vision_extract',
          message: message.text,
          nodes,
          connections,
          changesSummary,
          modelUsed: generated.model,
          userMessage: this.conversations.toDto(userMessage),
          assistantMessage: this.conversations.toDto(message),
        };
      } catch (err) {
        return this.failure(
          err,
          conversation,
          userMessage,
          user,
          current.nodes,
          current.connections,
          'no pude digitalizar la imagen. Prueba con una foto más nítida o en formato PNG/JPEG.',
        );
      }
    });
    return { userMessage: this.conversations.toDto(userMessage), result };
  }

  async processVisionDiagram(
    dto: AiVisionPromptDto,
    user: ChatUser,
  ): Promise<AiResponseDto> {
    return (await this.submitVisionDiagram(dto, user)).result;
  }

  // --- Internos ---

  /**
   * Aplica la respuesta del modelo: normalmente una lista de operaciones; si el modelo
   * devolvió el diagrama completo (formato antiguo), se fusiona con el actual.
   */
  private applyModelEdit(
    parsed: any,
    operations: DiagramOperation[],
    prompt: string,
    nodes: UmlClassNode[],
    connections: UmlConnection[],
  ) {
    if (Array.isArray(parsed.operations)) {
      const result = applyOperations(
        nodes,
        connections,
        dropUnrequestedOperations(operations, prompt),
      );
      if (result.skipped.length) {
        this.logger.warn(
          `Operaciones de Trazo no aplicadas: ${result.skipped.join('; ')}`,
        );
      }
      return result;
    }
    this.logger.warn(
      'El modelo devolvió el diagrama completo en lugar de operaciones',
    );
    return mergeNodesAndConnections(
      nodes,
      connections,
      withPositions(parsed.nodes),
      parsed.connections || [],
      prompt,
    );
  }

  /** Intención declarada por el modelo o, en respuestas sin ella, deducida de su contenido. */
  private intentOf(parsed: any, operations: DiagramOperation[]): ChatIntent {
    if (INTENTS.includes(parsed.intent)) {
      // Una edición sin operaciones es en realidad una respuesta
      if (
        parsed.intent === 'edit' &&
        !operations.length &&
        !Array.isArray(parsed.nodes)
      ) {
        return 'answer';
      }
      return parsed.intent;
    }
    if (parsed.isClarificationRequired) return 'clarify';
    if (operations.length || Array.isArray(parsed.nodes)) return 'edit';
    return 'answer';
  }

  /**
   * El diagrama sobre el que trabaja Trazo: el que envió el navegador o, si mientras la
   * petición esperaba turno alguien (o Trazo) lo cambió, el más reciente de la sala.
   */
  private currentDiagram(
    diagramId: string,
    dto: { currentNodes?: any[]; currentConnections?: any[] },
    receivedAt: number,
  ): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
    const snapshot = this.collaborationGateway.latestSnapshot(diagramId);
    if (snapshot && snapshot.at > receivedAt) {
      return {
        nodes: withPositions(snapshot.nodes),
        connections: snapshot.connections || [],
      };
    }
    return {
      nodes: withPositions(dto.currentNodes),
      connections: dto.currentConnections || [],
    };
  }

  private mentionedNodeIds(prompt: string, nodes: UmlClassNode[]): string[] {
    const normPrompt = normalizeForFuzzy(prompt);
    return nodes
      .filter((node) => {
        const normName = normalizeForFuzzy(node?.name);
        return (
          normName.length >= 3 &&
          (normPrompt.includes(normName) || !!findNodeFuzzy([node], prompt))
        );
      })
      .map((node) => node.id);
  }

  /** Historial para el modelo: cada mensaje de un colaborador lleva su nombre delante. */
  private toTurns(messages: AiMessageDocument[]): AiTurn[] {
    return messages.map((m) => {
      if (m.role === 'user') {
        return {
          role: 'user',
          text: formatUserTurn(m.author.userName, m.text),
        };
      }
      const note =
        m.intent === 'edit' && m.changesSummary
          ? `\n[Cambios aplicados: ${m.changesSummary}]`
          : m.intent === 'propose' && m.changesSummary
            ? `\n[Propuesta ${m.proposal?.state === 'applied' ? `aplicada por ${m.proposal.appliedBy?.userName}` : 'pendiente'}: ${m.changesSummary}]`
            : '';
      return { role: 'assistant', text: m.text + note };
    });
  }

  /** Guarda un mensaje y lo envía a todos los que tienen abierta la pizarra. */
  private async publish(
    conversation: AiConversationDocument,
    message: NewMessage,
  ): Promise<AiMessageDocument> {
    const saved = await this.conversations.addMessage(conversation, message);
    this.collaborationGateway.emitToDiagram(
      conversation.diagramId,
      'ai_message',
      this.conversations.toDto(saved),
    );
    return saved;
  }

  /**
   * Atiende las peticiones de un diagrama de una en una, para que cada respuesta vea las
   * anteriores, y avisa a la sala de a quién está respondiendo Trazo.
   */
  private enqueue<T>(
    diagramId: string,
    user: ChatUser,
    job: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(diagramId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        this.collaborationGateway.emitToDiagram(diagramId, 'ai_status', {
          diagramId,
          busy: true,
          userName: user.fullName,
        });
        return job();
      });
    const tail = run.catch((err) =>
      this.logger.error(
        `Trazo no pudo atender una petición: ${(err as Error)?.message || err}`,
      ),
    );
    this.queues.set(diagramId, tail);
    void tail.then(() => {
      if (this.queues.get(diagramId) !== tail) return;
      this.queues.delete(diagramId);
      this.collaborationGateway.emitToDiagram(diagramId, 'ai_status', {
        diagramId,
        busy: false,
      });
    });
    return run;
  }

  /** Resume en segundo plano los mensajes antiguos para que el contexto no crezca sin fin. */
  private summarizeLater(conversationId: string): void {
    if (this.summarizing.has(conversationId)) return;
    this.summarizing.add(conversationId);
    void this.summarize(conversationId)
      .catch((err) =>
        this.logger.warn(
          `No se pudo resumir la conversación: ${(err as Error)?.message || err}`,
        ),
      )
      .finally(() => this.summarizing.delete(conversationId));
  }

  private async summarize(conversationId: string): Promise<void> {
    const pending =
      await this.conversations.messagesToSummarize(conversationId);
    if (!pending) return;
    const transcript = pending.messages
      .map((m) => `${m.author.userName}: ${m.text}`)
      .join('\n');
    const { text } = await this.ai.generate({
      systemInstruction: SUMMARY_INSTRUCTION,
      parts: [
        {
          text: buildSummaryPrompt(pending.conversation.summary, transcript),
        },
      ],
    });
    if (!text.trim()) return;
    await this.conversations.saveSummary(
      pending.conversation,
      text.trim(),
      pending.messages[pending.messages.length - 1].id,
    );
    this.logger.log(
      `Conversación ${conversationId}: ${pending.messages.length} mensajes resumidos`,
    );
  }

  /** Resuelve las relaciones M:N y sanea el diagrama resultante. */
  private finalize(nodes: UmlClassNode[], connections: UmlConnection[]) {
    const resolved = resolveManyToManyRelationships(nodes, connections);
    const finalNodes = sanitizeNodes(resolved.nodes);
    return {
      nodes: finalNodes,
      connections: sanitizeConnections(resolved.connections, finalNodes),
    };
  }

  private authorOf(user: ChatUser): ChatAuthor {
    return { userId: user.id, userName: user.fullName };
  }

  private async failure(
    err: unknown,
    conversation: AiConversationDocument,
    userMessage: AiMessageDocument,
    user: ChatUser,
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    fallbackMessage: string,
  ): Promise<AiResponseDto> {
    const unavailable = err instanceof AiProviderUnavailableError;
    this.logger.error(`Trazo falló: ${(err as Error)?.message || err}`);
    const message = await this.publish(conversation, {
      role: 'assistant',
      author: TRAZO,
      replyTo: userMessage.id,
      text: addressTo(
        user.fullName,
        unavailable ? UNAVAILABLE_MESSAGE : fallbackMessage,
      ),
      status: 'error',
    }).catch(() => undefined);
    return {
      success: false,
      action: unavailable ? 'ai_unavailable' : 'error',
      message: message?.text || fallbackMessage,
      nodes,
      connections,
      changesSummary: 'Operación no aplicada.',
      userMessage: this.conversations.toDto(userMessage),
      assistantMessage: message ? this.conversations.toDto(message) : undefined,
    };
  }
}
