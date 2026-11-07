import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AiConversation,
  AiConversationDocument,
  AiMessage,
  AiMessageDocument,
  CanvasSnapshot,
  ChatAuthor,
  ChatChannel,
} from './ai-conversation.schema';
import { ChatMessageDto, ConversationDto } from '../dtos/ai-chat.dto';

/** Mensajes recientes que se envían al modelo tal cual; los anteriores van resumidos. */
export const HISTORY_WINDOW = 12;
/** Cuando hay más mensajes sin resumir que esto, los más antiguos se resumen. */
export const SUMMARY_TRIGGER = 24;
/** Mensajes hacia atrás en los que se busca el último diagrama con el que trabajó Trazo. */
const THREAD_WINDOW = 6;

export interface ConversationContext {
  summary: string;
  history: AiMessageDocument[];
}

export type NewMessage = Omit<
  AiMessage,
  | 'conversationId'
  | 'projectId'
  | 'channel'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
> &
  Partial<Pick<AiMessage, 'status'>>;

/**
 * Guarda en MongoDB las conversaciones de cada proyecto: el canal del equipo y las
 * conversaciones privadas con Trazo, con sus mensajes, propuestas y el resumen que mantiene
 * el contexto entre sesiones.
 */
@Injectable()
export class AiConversationService {
  constructor(
    @InjectModel(AiConversation.name)
    private readonly conversations: Model<AiConversation>,
    @InjectModel(AiMessage.name)
    private readonly messages: Model<AiMessage>,
  ) {}

  /** Conversación activa (canal del equipo o privada de `author`); si no hay ninguna, la crea. */
  async getActive(
    projectId: string,
    channel: ChatChannel,
    author: ChatAuthor,
  ): Promise<AiConversationDocument> {
    const ownerId = channel === 'direct' ? author.userId : '';
    const upsert = () =>
      this.conversations.findOneAndUpdate(
        { projectId, channel, ownerId, active: true },
        {
          $setOnInsert: {
            projectId,
            channel,
            ownerId,
            startedBy: author,
            active: true,
          },
        },
        { upsert: true, new: true },
      );
    try {
      return await upsert();
    } catch (err: any) {
      // Dos personas la abrieron a la vez: la otra petición ya la creó
      if (err?.code === 11000) return upsert();
      throw err;
    }
  }

  /** Cierra la conversación activa (se conserva como historial) y abre otra. */
  async startNew(
    projectId: string,
    channel: ChatChannel,
    author: ChatAuthor,
  ): Promise<AiConversationDocument> {
    const ownerId = channel === 'direct' ? author.userId : '';
    await this.conversations.updateMany(
      { projectId, channel, ownerId, active: true },
      { $set: { active: false } },
    );
    return this.conversations.create({
      projectId,
      channel,
      ownerId,
      startedBy: author,
      active: true,
    });
  }

  async findMessage(messageId: string): Promise<AiMessageDocument | null> {
    if (!/^[a-f0-9]{24}$/i.test(messageId)) return null;
    return this.messages.findById(messageId);
  }

  async addMessage(
    conversation: AiConversationDocument,
    message: NewMessage,
  ): Promise<AiMessageDocument> {
    const saved = await this.messages.create({
      ...message,
      conversationId: conversation.id,
      projectId: conversation.projectId,
      channel: conversation.channel,
    });
    await this.conversations.updateOne(
      { _id: conversation._id },
      { $inc: { messageCount: 1 } },
    );
    return saved;
  }

  /** Últimos mensajes de la conversación, del más antiguo al más reciente. */
  async recentMessages(
    conversation: AiConversationDocument,
    limit: number,
  ): Promise<{ messages: AiMessageDocument[]; hasMore: boolean }> {
    const latest = await this.messages
      .find({ conversationId: conversation.id })
      .sort({ _id: -1 })
      .limit(limit + 1);
    return {
      messages: latest.slice(0, limit).reverse(),
      hasMore: latest.length > limit,
    };
  }

  /**
   * Contexto para el modelo: el resumen de lo antiguo y los últimos mensajes sin resumir
   * (sin errores ni el mensaje que se está respondiendo).
   */
  async contextFor(
    conversation: AiConversationDocument,
    excludeId?: string,
  ): Promise<ConversationContext> {
    const history = await this.messages
      .find({
        conversationId: conversation.id,
        status: { $ne: 'error' },
        ...this.afterSummary(conversation, excludeId),
      })
      .sort({ _id: -1 })
      .limit(HISTORY_WINDOW);
    return { summary: conversation.summary || '', history: history.reverse() };
  }

  /** Diagrama con el que se trabajó en los últimos mensajes (para «ahora conéctala con…»). */
  async lastDiagramInThread(
    conversation: AiConversationDocument,
  ): Promise<string | undefined> {
    const recent = await this.messages
      .find({ conversationId: conversation.id })
      .sort({ _id: -1 })
      .limit(THREAD_WINDOW);
    return recent.find((m) => m.diagramId)?.diagramId;
  }

  /**
   * Si se acumularon demasiados mensajes sin resumir, devuelve los más antiguos para
   * resumirlos (dejando la ventana reciente intacta); si no, null.
   */
  async messagesToSummarize(conversationId: string): Promise<{
    conversation: AiConversationDocument;
    messages: AiMessageDocument[];
  } | null> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) return null;
    const pending = await this.messages
      .find({
        conversationId: conversation.id,
        status: { $ne: 'error' },
        ...this.afterSummary(conversation),
      })
      .sort({ _id: 1 });
    if (pending.length <= SUMMARY_TRIGGER) return null;
    return {
      conversation,
      messages: pending.slice(0, pending.length - HISTORY_WINDOW),
    };
  }

  async saveSummary(
    conversation: AiConversationDocument,
    summary: string,
    untilMessageId: string,
  ): Promise<void> {
    await this.conversations.updateOne(
      { _id: conversation._id },
      { $set: { summary, summarizedUntilId: untilMessageId } },
    );
  }

  async markProposalApplied(
    messageId: string,
    by: ChatAuthor,
  ): Promise<AiMessageDocument | null> {
    // Solo la primera persona que aplica la propuesta la aplica
    return this.messages.findOneAndUpdate(
      { _id: messageId, 'proposal.state': 'pending' },
      {
        $set: {
          'proposal.state': 'applied',
          'proposal.appliedBy': by,
          'proposal.appliedAt': new Date(),
        },
      },
      { new: true },
    );
  }

  /** Cambio de Trazo a revisión (resaltado y a la espera de aceptarlo o deshacerlo). */
  async startReview(
    messageId: string,
    before: CanvasSnapshot,
    after: CanvasSnapshot,
  ): Promise<AiMessageDocument | null> {
    return this.messages.findOneAndUpdate(
      { _id: messageId },
      { $set: { review: { state: 'pending', before, after } } },
      { new: true },
    );
  }

  /** Acepta o deshace un cambio pendiente; solo la primera decisión cuenta. */
  async decideReview(
    messageId: string,
    state: 'accepted' | 'reverted',
    by?: ChatAuthor,
  ): Promise<AiMessageDocument | null> {
    return this.messages.findOneAndUpdate(
      { _id: messageId, 'review.state': 'pending' },
      {
        $set: {
          'review.state': state,
          'review.at': new Date(),
          ...(by ? { 'review.by': by } : {}),
        },
      },
      { new: true },
    );
  }

  /** Cambios de Trazo aún pendientes de revisión en un diagrama. */
  async pendingReviewsOn(diagramId: string): Promise<AiMessageDocument[]> {
    return this.messages.find({ diagramId, 'review.state': 'pending' }).exec();
  }

  async findConversation(
    conversationId: string,
  ): Promise<AiConversationDocument | null> {
    return this.conversations.findById(conversationId).exec();
  }

  async revertProposal(messageId: string): Promise<void> {
    await this.messages.updateOne(
      { _id: messageId },
      {
        $set: { 'proposal.state': 'pending' },
        $unset: { 'proposal.appliedBy': '', 'proposal.appliedAt': '' },
      },
    );
  }

  toConversationDto(
    conversation: AiConversationDocument,
    messages: AiMessageDocument[],
    hasMore: boolean,
  ): ConversationDto {
    return {
      id: conversation.id,
      projectId: conversation.projectId,
      channel: conversation.channel,
      startedBy: conversation.startedBy,
      createdAt: conversation.createdAt,
      messages: messages.map((m) => this.toDto(m)),
      hasMore,
    };
  }

  toDto(message: AiMessageDocument): ChatMessageDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      projectId: message.projectId,
      channel: message.channel,
      role: message.role,
      author: {
        userId: message.author.userId,
        userName: message.author.userName,
      },
      text: message.text,
      mentions: message.mentions,
      diagramId: message.diagramId,
      diagramName: message.diagramName,
      clientId: message.clientId,
      replyTo: message.replyTo,
      intent: message.intent,
      status: message.status,
      changesSummary: message.changesSummary,
      operationsCount: message.operations?.length || undefined,
      proposal: message.proposal
        ? {
            state: message.proposal.state,
            appliedBy: message.proposal.appliedBy
              ? {
                  userId: message.proposal.appliedBy.userId,
                  userName: message.proposal.appliedBy.userName,
                }
              : undefined,
            appliedAt: message.proposal.appliedAt,
          }
        : undefined,
      review: message.review
        ? {
            state: message.review.state,
            by: message.review.by
              ? {
                  userId: message.review.by.userId,
                  userName: message.review.by.userName,
                }
              : undefined,
            at: message.review.at,
            // El antes y el después solo hacen falta mientras se resalta
            ...(message.review.state === 'pending'
              ? { before: message.review.before, after: message.review.after }
              : {}),
          }
        : undefined,
      image: message.image,
      model: message.model,
      latencyMs: message.latencyMs,
      createdAt: message.createdAt,
    };
  }

  private afterSummary(
    conversation: AiConversationDocument,
    excludeId?: string,
  ) {
    const idFilter: Record<string, string> = {};
    if (conversation.summarizedUntilId) {
      idFilter.$gt = conversation.summarizedUntilId;
    }
    if (excludeId) idFilter.$ne = excludeId;
    return Object.keys(idFilter).length ? { _id: idFilter } : {};
  }
}
