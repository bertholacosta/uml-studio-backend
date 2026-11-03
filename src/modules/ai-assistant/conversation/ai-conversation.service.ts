import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AiConversation,
  AiConversationDocument,
  AiMessage,
  AiMessageDocument,
  ChatAuthor,
} from './ai-conversation.schema';
import { ChatMessageDto, ConversationDto } from '../dtos/ai-chat.dto';

/** Mensajes recientes que se envían al modelo tal cual; los anteriores van resumidos. */
export const HISTORY_WINDOW = 12;
/** Cuando hay más mensajes sin resumir que esto, los más antiguos se resumen. */
export const SUMMARY_TRIGGER = 24;

export interface ConversationContext {
  summary: string;
  history: AiMessageDocument[];
}

/**
 * Guarda en MongoDB la conversación compartida de cada pizarra: mensajes de los
 * colaboradores, respuestas de Trazo, propuestas y el resumen que mantiene el contexto.
 */
@Injectable()
export class AiConversationService {
  constructor(
    @InjectModel(AiConversation.name)
    private readonly conversations: Model<AiConversation>,
    @InjectModel(AiMessage.name)
    private readonly messages: Model<AiMessage>,
  ) {}

  /** Conversación activa del diagrama; si no hay ninguna, la crea. */
  async getActive(
    diagramId: string,
    author: ChatAuthor,
    projectId?: string,
  ): Promise<AiConversationDocument> {
    const upsert = () =>
      this.conversations.findOneAndUpdate(
        { diagramId, active: true },
        {
          $setOnInsert: {
            diagramId,
            projectId,
            startedBy: author,
            active: true,
          },
        },
        { upsert: true, new: true },
      );
    try {
      return await upsert();
    } catch (err: any) {
      // Dos colaboradores abrieron la pizarra a la vez: la otra petición ya la creó
      if (err?.code === 11000) return upsert();
      throw err;
    }
  }

  /** Cierra la conversación activa (se conserva como historial) y abre otra. */
  async startNew(
    diagramId: string,
    author: ChatAuthor,
    projectId?: string,
  ): Promise<AiConversationDocument> {
    await this.conversations.updateMany(
      { diagramId, active: true },
      { $set: { active: false } },
    );
    return this.conversations.create({
      diagramId,
      projectId,
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
    message: Omit<
      AiMessage,
      'conversationId' | 'diagramId' | 'createdAt' | 'updatedAt' | 'status'
    > &
      Partial<Pick<AiMessage, 'status'>>,
  ): Promise<AiMessageDocument> {
    const saved = await this.messages.create({
      ...message,
      conversationId: conversation.id,
      diagramId: conversation.diagramId,
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
      diagramId: conversation.diagramId,
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
      role: message.role,
      author: {
        userId: message.author.userId,
        userName: message.author.userName,
      },
      text: message.text,
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
