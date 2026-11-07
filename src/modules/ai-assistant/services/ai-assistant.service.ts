import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { DiagramService } from '../../diagrams/services/diagram.service';
import { AiPromptDto, AiVisionPromptDto } from '../dtos/ai-request.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';
import {
  ApplyProposalDto,
  ChatMessageDto,
  ConversationDto,
  OpenDiagramDto,
  SendChatMessageDto,
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
  describeActivity,
  formatUserTurn,
  timeAgo,
} from '../prompts/mentor.prompts';
import {
  ActivityFocus,
  ProjectMember,
  activityFocus,
} from '../domain/activity-focus';
import { ActivityService } from '../../activity/activity.service';
import { CanvasActivityDocument } from '../../activity/canvas-activity.schema';
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
import { reviewFindings } from '../domain/model-review';
import {
  parseModelJson,
  sanitizeConnections,
  sanitizeNodes,
  withPositions,
} from '../domain/diagram-sanitizer';
import {
  DiagramRef,
  DiagramTarget,
  diagramTag,
  resolveDiagramTarget,
} from '../domain/diagram-target';
import {
  AiConversationService,
  NewMessage,
} from '../conversation/ai-conversation.service';
import {
  AiConversationDocument,
  AiMessageDocument,
  ChatAuthor,
  ChatChannel,
  ChatIntent,
} from '../conversation/ai-conversation.schema';

/** Mensaje guardado; si llamó a Trazo, `result` se resuelve cuando Trazo responde. */
export interface SubmittedMessage {
  message: ChatMessageDto;
  result?: Promise<AiResponseDto>;
}

/** Quien escribe: el usuario autenticado. */
export interface ChatUser {
  id: string;
  fullName: string;
}

interface Canvas {
  target: DiagramTarget | null;
  diagrams: DiagramRef[];
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  /** Sección de actividad del prompt (quién hizo qué), si viene al caso. */
  activity?: string;
}

const DAY_MS = 24 * 60 * 60_000;

const TRAZO: ChatAuthor = { userId: AI_USER_ID, userName: AI_USER_NAME };
const TRAZO_MENTION = /(^|[^\p{L}\d_])@trazo\b/iu;
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
// Piden una revisión: Trazo recibe además las comprobaciones automáticas del diagrama
const REVIEW_REQUEST =
  /(?:revis|eval[uú]a|corrig|est[aá] bien|qu[eé] (?:le )?(?:falta|sobra)|mejorar|feedback|opini[oó]n)/i;
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
 * Orquestador de Trazo: la capa intermedia entre el equipo y la única instancia de IA.
 *
 * Recibe los mensajes del canal del equipo de cada proyecto (y de las conversaciones privadas),
 * los guarda en MongoDB y los difunde. Solo cuando alguien menciona a Trazo (o le escribe en
 * privado) decide sobre qué lienzo trabajar, arma el contexto (conversación, proyecto, quién
 * está conectado, el diagrama), llama al modelo, aplica y guarda los cambios y responde a la
 * persona por su nombre. Las peticiones de un mismo proyecto se atienden en orden.
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
    private readonly diagrams: DiagramService,
    private readonly activity: ActivityService,
  ) {}

  // --- Conversaciones ---

  async getConversation(
    projectId: string,
    channel: ChatChannel,
    user: ChatUser,
    limit = 60,
  ): Promise<ConversationDto> {
    await this.access.assertProjectAccess(projectId, user.id, 'read');
    const conversation = await this.conversations.getActive(
      projectId,
      channel,
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

  /**
   * Empieza una conversación nueva (la anterior queda guardada). El canal del equipo solo lo
   * puede reiniciar el administrador del proyecto; la conversación privada, su dueño.
   */
  async startConversation(
    projectId: string,
    channel: ChatChannel,
    user: ChatUser,
  ): Promise<ConversationDto> {
    const role = await this.access.assertProjectAccess(
      projectId,
      user.id,
      'read',
    );
    if (channel === 'team' && role !== ProjectRole.OWNER) {
      throw new ForbiddenException(
        'Solo el administrador del proyecto puede reiniciar el canal del equipo',
      );
    }
    const conversation = await this.conversations.startNew(
      projectId,
      channel,
      this.authorOf(user),
    );
    const dto = this.conversations.toConversationDto(conversation, [], false);
    this.emit(conversation, 'chat_reset', dto);
    return dto;
  }

  // --- Mensajes ---

  /**
   * Guarda y difunde un mensaje. Si menciona a Trazo (o es una conversación privada), pone la
   * respuesta en la cola del proyecto y devuelve al instante: la respuesta llega por el socket
   * (evento chat_message), así un modelo lento no bloquea la petición HTTP.
   */
  async submitMessage(
    projectId: string,
    dto: SendChatMessageDto,
    user: ChatUser,
  ): Promise<SubmittedMessage> {
    const role = await this.access.assertProjectAccess(
      projectId,
      user.id,
      'read',
    );
    // Desde la app móvil nunca se edita: Trazo responde o deja una propuesta
    const canEdit = role !== ProjectRole.VIEWER && !dto.readOnly;
    const receivedAt = Date.now();
    const text = dto.text.trim();
    const callsTrazo =
      dto.channel === 'direct' ||
      TRAZO_MENTION.test(text) ||
      !!dto.mentions?.includes(AI_USER_ID);
    const mentions = [
      ...new Set([
        ...(dto.mentions || []),
        ...(callsTrazo && dto.channel === 'team' ? [AI_USER_ID] : []),
      ]),
    ];

    const conversation = await this.conversations.getActive(
      projectId,
      dto.channel,
      this.authorOf(user),
    );
    const userMessage = await this.publish(conversation, {
      role: 'user',
      author: this.authorOf(user),
      text,
      clientId: dto.clientId,
      mentions: mentions.length ? mentions : undefined,
    });
    const message = this.conversations.toDto(userMessage);
    if (!callsTrazo) return { message };

    const result = this.enqueue(conversation, user, async () => {
      const canvas = await this.canvasFor(
        conversation,
        text,
        dto,
        receivedAt,
        user,
      );
      const response = await this.answerText(
        conversation,
        userMessage,
        user,
        canEdit,
        text,
        canvas,
      );
      this.summarizeLater(conversation.id);
      return response;
    });
    return { message, result };
  }

  /**
   * Pregunta privada a Trazo sobre un diagrama concreto, esperando la respuesta (la usan las
   * pruebas y los clientes que no escuchan el socket).
   */
  async processTextPrompt(
    dto: AiPromptDto,
    user: ChatUser,
  ): Promise<AiResponseDto> {
    const projectId = await this.projectOf(dto.diagramId);
    const { result } = await this.submitMessage(
      projectId,
      {
        channel: 'direct',
        text: dto.prompt,
        clientId: dto.clientId,
        activeDiagramId: dto.diagramId,
        currentNodes: dto.currentNodes,
        currentConnections: dto.currentConnections,
      },
      user,
    );
    return result!;
  }

  private async answerText(
    conversation: AiConversationDocument,
    userMessage: AiMessageDocument,
    user: ChatUser,
    canEdit: boolean,
    prompt: string,
    canvas: Canvas,
  ): Promise<AiResponseDto> {
    const {
      target,
      nodes: currentNodes,
      connections: currentConnections,
    } = canvas;
    const diagramId = target?.diagram.id;
    const onCanvas = target
      ? { diagramId: target.diagram.id, diagramName: target.diagram.name }
      : {};
    const reply = (fields: Omit<NewMessage, 'role' | 'author'>) =>
      this.publish(conversation, {
        role: 'assistant',
        author: TRAZO,
        replyTo: userMessage.id,
        ...onCanvas,
        ...fields,
        text: addressTo(user.fullName, fields.text),
      });

    // Vaciar el diagrama no necesita al modelo
    if (
      diagramId &&
      canEdit &&
      !ATTRIBUTE_OR_METHOD.test(prompt) &&
      DELETE_ALL.some((re) => re.test(prompt))
    ) {
      await this.saveCanvas(diagramId, [], [], user);
      this.collaborationGateway.broadcastAiMutation(diagramId, [], []);
      const message = await reply({
        text: `vacié ${diagramTag(target.diagram.name)}: eliminé todas las clases y relaciones.`,
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
    const lockedIds =
      diagramId && canEdit ? this.mentionedNodeIds(prompt, currentNodes) : [];
    if (diagramId) {
      this.collaborationGateway.lockNodesForAi(diagramId, lockedIds);
    }

    try {
      const [context, projectName] = await Promise.all([
        this.conversations.contextFor(conversation, userMessage.id),
        this.access.getProjectName(conversation.projectId),
      ]);
      const diagramNames = new Map(canvas.diagrams.map((d) => [d.id, d.name]));
      const generated = await this.ai.generate({
        systemInstruction: buildMentorInstruction(context.summary),
        history: this.toTurns(context.history),
        parts: [
          {
            text: buildMentorPrompt({
              speaker: user.fullName,
              canEdit,
              prompt,
              channel: conversation.channel,
              projectName,
              diagrams: canvas.diagrams.map((d) => ({
                name: d.name,
                classCount: d.classNames.length,
              })),
              target: target
                ? { name: target.diagram.name, reason: target.reason }
                : undefined,
              activity: canvas.activity,
              participants: this.collaborationGateway
                .connectedUsers(conversation.projectId)
                .map((p) => ({
                  userName: p.userName,
                  canEdit: p.canEdit,
                  diagramName: p.diagramId
                    ? diagramNames.get(p.diagramId)
                    : undefined,
                })),
              findings: REVIEW_REQUEST.test(prompt)
                ? reviewFindings(currentNodes, currentConnections)
                : undefined,
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

      // Hay cambios que hacer pero no se sabe en qué lienzo: se pregunta
      if (
        !target &&
        operations.length &&
        (intent === 'edit' || intent === 'propose')
      ) {
        const tags = canvas.diagrams.map((d) => diagramTag(d.name));
        const message = await reply({
          text: tags.length
            ? `¿en qué diagrama lo hago? Indícalo con #: ${tags.join(', ')}.`
            : 'el proyecto todavía no tiene diagramas: crea uno y vuelve a pedírmelo.',
          intent: 'clarify',
          status: 'clarification',
          ...modelInfo,
        });
        return {
          ...common,
          success: false,
          action: 'clarification_required',
          message: message.text,
          nodes: [],
          connections: [],
          changesSummary: 'Falta indicar el diagrama.',
          assistantMessage: this.conversations.toDto(message),
        };
      }

      if (intent === 'edit' && target) {
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
        await this.saveCanvas(target.diagram.id, nodes, connections, user);
        this.collaborationGateway.broadcastAiMutation(
          target.diagram.id,
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
      if (diagramId) {
        this.collaborationGateway.unlockNodesForAi(diagramId, lockedIds);
      }
    }
  }

  // --- Propuestas ---

  /** Aplica a su diagrama los cambios que Trazo propuso en un mensaje. */
  async applyProposal(
    messageId: string,
    dto: ApplyProposalDto,
    user: ChatUser,
  ): Promise<AiResponseDto> {
    const message = await this.conversations.findMessage(messageId);
    if (!message?.proposal || !message.operations?.length) {
      throw new NotFoundException('Propuesta no encontrada');
    }
    if (!message.diagramId) {
      throw new BadRequestException('La propuesta no indica en qué diagrama');
    }
    await this.access.assertDiagramAccess(message.diagramId, user.id, 'write');
    const conversation = await this.conversations.getActive(
      message.projectId,
      message.channel,
      this.authorOf(user),
    );
    // Una propuesta privada solo la ve (y la aplica) quien conversa con Trazo
    if (
      conversation.id !== message.conversationId &&
      message.channel === 'direct'
    ) {
      throw new NotFoundException('Propuesta no encontrada');
    }
    const receivedAt = Date.now();
    const diagramId = message.diagramId;

    return this.enqueue(conversation, user, async () => {
      const applied = await this.conversations.markProposalApplied(
        messageId,
        this.authorOf(user),
      );
      if (!applied) {
        throw new ConflictException('Esta propuesta ya se aplicó');
      }
      try {
        const current = await this.loadCanvas(diagramId, dto, receivedAt, user);
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
        await this.saveCanvas(diagramId, nodes, connections, user);
        this.collaborationGateway.broadcastAiMutation(
          diagramId,
          nodes,
          connections,
        );
        const dtoMessage = this.conversations.toDto(applied);
        this.emit(conversation, 'chat_message', dtoMessage);
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

  /** Digitaliza una imagen en el diagrama indicado; la respuesta llega por el socket. */
  async submitVisionDiagram(
    dto: AiVisionPromptDto,
    user: ChatUser,
  ): Promise<SubmittedMessage> {
    await this.access.assertDiagramAccess(dto.diagramId, user.id, 'write');
    const projectId = await this.projectOf(dto.diagramId);
    const receivedAt = Date.now();

    // El tipo MIME de un data URI tiene prioridad sobre el declarado
    const dataUri = dto.imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType = dataUri?.[1] || dto.mimeType;
    const data = dto.imageBase64
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s+/g, '');
    const image: AiPart = { inlineData: { mimeType, data } };

    const conversation = await this.conversations.getActive(
      projectId,
      dto.channel || 'team',
      this.authorOf(user),
    );
    const userMessage = await this.publish(conversation, {
      role: 'user',
      author: this.authorOf(user),
      text: dto.prompt?.trim() || 'Digitaliza el diagrama de esta imagen.',
      clientId: dto.clientId,
      mentions: conversation.channel === 'team' ? [AI_USER_ID] : undefined,
      image:
        dto.imageBase64.length <= MAX_STORED_IMAGE_CHARS
          ? `data:${mimeType};base64,${data}`
          : undefined,
    });

    const result = this.enqueue(conversation, user, async () => {
      const current = await this.loadCanvas(
        dto.diagramId,
        { ...dto, activeDiagramId: dto.diagramId },
        receivedAt,
        user,
      );
      const diagramName = (await this.access.getDiagramContext(dto.diagramId))
        .diagramName;
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
        await this.saveCanvas(dto.diagramId, nodes, connections, user);
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
          diagramId: dto.diagramId,
          diagramName,
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
    return { message: this.conversations.toDto(userMessage), result };
  }

  async processVisionDiagram(
    dto: AiVisionPromptDto,
    user: ChatUser,
  ): Promise<AiResponseDto> {
    return (await this.submitVisionDiagram(dto, user)).result!;
  }

  // --- Internos ---

  /** Elige el lienzo del mensaje y carga su contenido más reciente. */
  private async canvasFor(
    conversation: AiConversationDocument,
    text: string,
    dto: OpenDiagramDto,
    receivedAt: number,
    user: ChatUser,
  ): Promise<Canvas> {
    const [diagrams, threadDiagramId, members] = await Promise.all([
      this.access.listProjectDiagrams(conversation.projectId),
      this.conversations.lastDiagramInThread(conversation),
      this.access.listProjectMembers(conversation.projectId),
    ]);
    const speaker = { userId: user.id, userName: user.fullName };
    const focus = activityFocus(text, members, speaker);
    const { entries, text: activity } = await this.activityFor(
      conversation.projectId,
      focus,
      speaker,
    );
    const target = resolveDiagramTarget(text, diagrams, {
      activeDiagramId: dto.activeDiagramId,
      threadDiagramId,
      // «Revisa lo que hizo Marco»: el lienzo donde trabajó Marco por última vez
      activityDiagramId: focus.aboutWork ? entries[0]?.diagramId : undefined,
    });
    if (!target) {
      return { target, diagrams, nodes: [], connections: [], activity };
    }
    const content = await this.loadCanvas(
      target.diagram.id,
      dto,
      receivedAt,
      user,
    );
    return { target, diagrams, ...content, activity };
  }

  /**
   * Qué parte del registro de actividad necesita el mensaje: el trabajo de las personas que
   * nombra, lo que pasó desde la última conexión de quien escribe o, si no, lo más reciente.
   */
  private async activityFor(
    projectId: string,
    focus: ActivityFocus,
    speaker: ProjectMember,
  ): Promise<{ entries: CanvasActivityDocument[]; text?: string }> {
    const now = new Date();
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
    try {
      let entries: CanvasActivityDocument[];
      let title: string;
      let note: string | undefined;
      // Al ponerse al día, de cada entrada solo cuenta lo posterior a la última conexión
      let since: Date | undefined;

      if (focus.aboutWork) {
        entries = await this.activity.recent(projectId, {
          userIds: focus.people.map((p) => p.userId),
          since: daysAgo(14),
          limit: 12,
        });
        const names = focus.people
          .map((p) =>
            p.userId === speaker.userId
              ? `${p.userName} (quien escribe)`
              : p.userName,
          )
          .join(' y ');
        title = `trabajo de ${names} en los últimos 14 días, incluido lo que pidió a Trazo`;
      } else if (focus.catchUp) {
        const lastSeen = await this.activity.lastSeen(
          projectId,
          speaker.userId,
        );
        const fromLastVisit = !!lastSeen && lastSeen > daysAgo(14);
        since = fromLastVisit ? lastSeen : daysAgo(1);
        entries = (
          await this.activity.recent(projectId, { since, limit: 20 })
        ).filter((e) => this.activity.summarySince(e, since));
        title = fromLastVisit
          ? `desde la última conexión de ${speaker.userName}, ${timeAgo(lastSeen, now)}`
          : 'últimas 24 h';
        if (!entries.length) {
          since = undefined;
          entries = await this.activity.recent(projectId, {
            since: daysAgo(14),
            limit: 5,
          });
          note = `No hubo cambios en ese periodo; lo de arriba es lo último registrado.`;
        }
      } else {
        entries = await this.activity.recent(projectId, {
          since: daysAgo(3),
          limit: 5,
        });
        if (!entries.length) return { entries };
        title = 'cambios recientes';
      }

      return {
        entries,
        text: describeActivity(
          title,
          entries.map((e) => ({
            actorName: e.actor.userName,
            diagramName: e.diagramName,
            summary: this.activity.summarySince(e, since),
            updatedAt: e.updatedAt,
          })),
          now,
          note,
        ),
      };
    } catch (err) {
      this.logger.warn(
        `No se pudo leer la actividad: ${(err as Error).message}`,
      );
      return { entries: [] };
    }
  }

  /**
   * Contenido del diagrama sobre el que trabaja Trazo: el de la sala si alguien lo cambió
   * mientras la petición esperaba turno, el que envió el navegador si es el que tiene abierto,
   * el último que circuló por la sala o, si nadie lo tiene abierto, el guardado.
   */
  private async loadCanvas(
    diagramId: string,
    dto: OpenDiagramDto,
    receivedAt: number,
    user: ChatUser,
  ): Promise<{ nodes: UmlClassNode[]; connections: UmlConnection[] }> {
    const snapshot = this.collaborationGateway.latestSnapshot(diagramId);
    if (snapshot && snapshot.at > receivedAt) {
      return {
        nodes: withPositions(snapshot.nodes),
        connections: snapshot.connections || [],
      };
    }
    if (dto.activeDiagramId === diagramId && dto.currentNodes) {
      return {
        nodes: withPositions(dto.currentNodes),
        connections: dto.currentConnections || [],
      };
    }
    if (snapshot) {
      return {
        nodes: withPositions(snapshot.nodes),
        connections: snapshot.connections || [],
      };
    }
    const saved = await this.diagrams.findOne(diagramId, user.id);
    return {
      nodes: withPositions(saved.nodes),
      connections: (saved.connections || []) as UmlConnection[],
    };
  }

  /** Guarda en PostgreSQL los cambios de Trazo, aunque nadie tenga el diagrama abierto. */
  private async saveCanvas(
    diagramId: string,
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    user: ChatUser,
  ): Promise<void> {
    const actor = {
      userId: AI_USER_ID,
      userName: `${AI_USER_NAME} (a pedido de ${firstName(user.fullName)})`,
      onBehalfOf: { userId: user.id, userName: user.fullName },
    };
    await this.diagrams.saveAst(
      diagramId,
      {
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.name,
          positionX: n.position.x,
          positionY: n.position.y,
          width: n.width,
          height: n.height ?? null,
          isAnchor: n.isAnchor,
          assocMainConnId: n.assocMainConnId ?? null,
          attributes: n.attributes,
          methods: n.methods,
        })),
        connections: connections.map((c) => ({
          id: c.id,
          sourceNodeId: c.sourceNodeId || '',
          targetNodeId: c.targetNodeId || '',
          sourceId: c.sourceId,
          targetId: c.targetId,
          type: c.type,
          name: c.name,
          sourceMultiplicity: c.sourceMultiplicity,
          targetMultiplicity: c.targetMultiplicity,
          assocAnchorNodeId: c.assocAnchorNodeId ?? null,
        })),
      } as any,
      user.id,
      actor,
    );
  }

  private async projectOf(diagramId: string): Promise<string> {
    const { projectId } = await this.access.getDiagramContext(diagramId);
    if (!projectId) throw new NotFoundException('Diagrama no encontrado');
    return projectId;
  }

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

  /** Historial para el modelo: cada mensaje de una persona lleva su nombre delante. */
  private toTurns(messages: AiMessageDocument[]): AiTurn[] {
    return messages.map((m) => {
      if (m.role === 'user') {
        return {
          role: 'user',
          text: formatUserTurn(m.author.userName, m.text),
        };
      }
      const where = m.diagramName ? ` en ${diagramTag(m.diagramName)}` : '';
      const note =
        m.intent === 'edit' && m.changesSummary
          ? `\n[Cambios aplicados${where}: ${m.changesSummary}]`
          : m.intent === 'propose' && m.changesSummary
            ? `\n[Propuesta${where} ${m.proposal?.state === 'applied' ? `aplicada por ${m.proposal.appliedBy?.userName}` : 'pendiente'}: ${m.changesSummary}]`
            : '';
      return { role: 'assistant', text: m.text + note };
    });
  }

  /** Guarda un mensaje y lo envía a quien corresponde (canal del equipo o conversación privada). */
  private async publish(
    conversation: AiConversationDocument,
    message: NewMessage,
  ): Promise<AiMessageDocument> {
    const saved = await this.conversations.addMessage(conversation, message);
    this.emit(conversation, 'chat_message', this.conversations.toDto(saved));
    return saved;
  }

  private emit(
    conversation: AiConversationDocument,
    event: string,
    payload: unknown,
  ): void {
    if (conversation.channel === 'direct') {
      this.collaborationGateway.emitToUser(
        conversation.ownerId,
        event,
        payload,
      );
    } else {
      this.collaborationGateway.emitToProject(
        conversation.projectId,
        event,
        payload,
      );
    }
  }

  /**
   * Atiende las peticiones de un proyecto de una en una (hay una sola instancia de IA y cada
   * respuesta debe ver las anteriores), y avisa de a quién está respondiendo Trazo.
   */
  private enqueue<T>(
    conversation: AiConversationDocument,
    user: ChatUser,
    job: () => Promise<T>,
  ): Promise<T> {
    const key = conversation.projectId;
    const status = (busy: boolean) =>
      this.emit(conversation, 'trazo_status', {
        projectId: conversation.projectId,
        channel: conversation.channel,
        busy,
        ...(busy ? { userName: user.fullName } : {}),
      });
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        status(true);
        try {
          return await job();
        } finally {
          status(false);
        }
      });
    const tail = run.catch((err) =>
      this.logger.error(
        `Trazo no pudo atender una petición: ${(err as Error)?.message || err}`,
      ),
    );
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
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
