import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ChatAuthor,
  ChatAuthorSchema,
} from '../conversation/ai-conversation.schema';
import {
  TRAZO_CREATIVITIES,
  TRAZO_DELIVERIES,
  TRAZO_STYLES,
  type TrazoCreativity,
  type TrazoDelivery,
  type TrazoStyle,
} from './trazo-settings';

/** Configuración de Trazo de un proyecto («Configurar Trazo»). */
@Schema({ collection: 'trazo_settings', timestamps: true })
export class TrazoSettings {
  @Prop({ required: true, unique: true })
  projectId: string;

  @Prop({ type: String, enum: TRAZO_DELIVERIES, required: true })
  delivery: TrazoDelivery;

  @Prop({ type: String, enum: TRAZO_STYLES, required: true })
  style: TrazoStyle;

  @Prop({ type: String, enum: TRAZO_CREATIVITIES, required: true })
  creativity: TrazoCreativity;

  @Prop()
  model?: string;

  @Prop({ type: ChatAuthorSchema })
  updatedBy?: ChatAuthor;

  createdAt: Date;
  updatedAt: Date;
}
export type TrazoSettingsDocument = HydratedDocument<TrazoSettings>;
export const TrazoSettingsSchema = SchemaFactory.createForClass(TrazoSettings);
