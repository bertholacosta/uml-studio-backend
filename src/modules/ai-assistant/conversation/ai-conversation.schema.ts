import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

/** Persona que escribe un mensaje o realiza una acción en la conversación. */
@Schema({ _id: false })
export class ChatAuthor {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;
}
export const ChatAuthorSchema = SchemaFactory.createForClass(ChatAuthor);

/**
 * team: canal del equipo del proyecto, como un canal de Slack; Trazo es un miembro más y solo
 * responde cuando lo mencionan. direct: conversación privada de una persona con Trazo.
 */
export type ChatChannel = 'team' | 'direct';
export const CHAT_CHANNELS: ChatChannel[] = ['team', 'direct'];

/**
 * Conversación de un proyecto: el canal del equipo o la conversación privada de una persona
 * con Trazo. Al empezar una nueva, la anterior se conserva como historial.
 */
@Schema({ collection: 'chat_conversations', timestamps: true })
export class AiConversation {
  @Prop({ required: true })
  projectId: string;

  @Prop({ type: String, required: true, enum: CHAT_CHANNELS })
  channel: ChatChannel;

  /** Dueño de la conversación privada (vacío en el canal del equipo). */
  @Prop({ default: '' })
  ownerId: string;

  @Prop({ type: ChatAuthorSchema, required: true })
  startedBy: ChatAuthor;

  /** Resumen de los mensajes antiguos, para mantener el contexto sin enviar todo el historial. */
  @Prop({ default: '' })
  summary: string;

  /** Id del último mensaje incluido en el resumen (los ObjectId crecen con el tiempo). */
  @Prop()
  summarizedUntilId?: string;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ default: true })
  active: boolean;

  createdAt: Date;
  updatedAt: Date;
}
export type AiConversationDocument = HydratedDocument<AiConversation>;
export const AiConversationSchema =
  SchemaFactory.createForClass(AiConversation);
// Un solo canal del equipo activo por proyecto y una conversación privada activa por persona
AiConversationSchema.index(
  { projectId: 1, channel: 1, ownerId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

export type ChatRole = 'user' | 'assistant';
/** answer: explicación; edit: cambios aplicados; propose: cambios a la espera de que alguien los aplique. */
export type ChatIntent = 'answer' | 'edit' | 'propose' | 'clarify' | 'vision';
export type ChatStatus = 'success' | 'clarification' | 'error';

@Schema({ _id: false })
export class ChatProposal {
  @Prop({ type: String, required: true, enum: ['pending', 'applied'] })
  state: 'pending' | 'applied';

  @Prop({ type: ChatAuthorSchema })
  appliedBy?: ChatAuthor;

  @Prop()
  appliedAt?: Date;
}
const ChatProposalSchema = SchemaFactory.createForClass(ChatProposal);

/** Mensaje de una conversación: de una persona del equipo o de Trazo. */
@Schema({ collection: 'chat_messages', timestamps: true })
export class AiMessage {
  @Prop({ required: true })
  conversationId: string;

  @Prop({ required: true, index: true })
  projectId: string;

  @Prop({ type: String, required: true, enum: CHAT_CHANNELS })
  channel: ChatChannel;

  @Prop({ type: String, required: true, enum: ['user', 'assistant'] })
  role: ChatRole;

  @Prop({ type: ChatAuthorSchema, required: true })
  author: ChatAuthor;

  @Prop({ required: true })
  text: string;

  /** Ids de las personas mencionadas con @ (y de Trazo, si lo llamaron). */
  @Prop({ type: [String], default: undefined })
  mentions?: string[];

  /** Diagrama (lienzo) sobre el que trabajó Trazo o al que se refiere el mensaje. */
  @Prop()
  diagramId?: string;

  @Prop()
  diagramName?: string;

  /** Id temporal que asigna el navegador, para sustituir su mensaje provisional. */
  @Prop()
  clientId?: string;

  /** Mensaje al que responde Trazo. */
  @Prop()
  replyTo?: string;

  @Prop({
    type: String,
    enum: ['answer', 'edit', 'propose', 'clarify', 'vision'],
  })
  intent?: ChatIntent;

  @Prop({
    type: String,
    enum: ['success', 'clarification', 'error'],
    default: 'success',
  })
  status: ChatStatus;

  @Prop()
  changesSummary?: string;

  /** Operaciones sobre el diagrama que devolvió el modelo (aplicadas o propuestas). */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: undefined })
  operations?: Record<string, unknown>[];

  @Prop({ type: ChatProposalSchema })
  proposal?: ChatProposal;

  /** Miniatura de la imagen adjunta (data URI). */
  @Prop()
  image?: string;

  @Prop()
  model?: string;

  @Prop()
  latencyMs?: number;

  @Prop({ type: Object })
  usage?: { inputTokens?: number; outputTokens?: number };

  createdAt: Date;
  updatedAt: Date;
}
export type AiMessageDocument = HydratedDocument<AiMessage>;
export const AiMessageSchema = SchemaFactory.createForClass(AiMessage);
AiMessageSchema.index({ conversationId: 1, _id: 1 });
