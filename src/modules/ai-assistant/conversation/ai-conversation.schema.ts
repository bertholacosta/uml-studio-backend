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
const ChatAuthorSchema = SchemaFactory.createForClass(ChatAuthor);

/**
 * Conversación con Trazo en la pizarra de un diagrama. Es compartida: todos los
 * colaboradores del diagrama ven y continúan la misma. Al empezar una nueva, la
 * anterior se conserva como historial.
 */
@Schema({ collection: 'ai_conversations', timestamps: true })
export class AiConversation {
  @Prop({ required: true })
  diagramId: string;

  @Prop()
  projectId?: string;

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
// Una sola conversación activa por diagrama
AiConversationSchema.index(
  { diagramId: 1 },
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

/** Mensaje de la conversación: pregunta de un colaborador o respuesta de Trazo. */
@Schema({ collection: 'ai_messages', timestamps: true })
export class AiMessage {
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true, index: true })
  diagramId: string;

  @Prop({ type: String, required: true, enum: ['user', 'assistant'] })
  role: ChatRole;

  @Prop({ type: ChatAuthorSchema, required: true })
  author: ChatAuthor;

  @Prop({ required: true })
  text: string;

  /** Id temporal que asigna el navegador, para sustituir su mensaje provisional. */
  @Prop()
  clientId?: string;

  /** Mensaje del usuario al que responde Trazo. */
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
