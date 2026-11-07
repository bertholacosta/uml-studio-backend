import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { CanvasChange } from './canvas-diff';

/** Quién hizo un cambio. */
@Schema({ _id: false })
export class ActivityActor {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;
}
const ActivityActorSchema = SchemaFactory.createForClass(ActivityActor);

/**
 * Lo que una persona cambió en un lienzo durante un rato de trabajo: los cambios seguidos de la
 * misma persona en el mismo diagrama se suman en una sola entrada. Es la memoria de autoría que
 * usa Trazo para «¿qué hizo Marco?» o «ponme al día» (no es un historial de versiones).
 */
@Schema({ collection: 'canvas_activity', timestamps: true })
export class CanvasActivity {
  @Prop({ required: true })
  projectId: string;

  @Prop({ required: true })
  diagramId: string;

  @Prop({ required: true })
  diagramName: string;

  @Prop({ type: ActivityActorSchema, required: true })
  actor: ActivityActor;

  /** Si el cambio lo hizo Trazo, a pedido de quién. */
  @Prop({ type: ActivityActorSchema })
  onBehalfOf?: ActivityActor;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  changes: CanvasChange[];

  /** El resumen legible de los cambios, para el chat y la app móvil. */
  @Prop({ default: '' })
  summary: string;

  createdAt: Date;
  updatedAt: Date;
}
export type CanvasActivityDocument = HydratedDocument<CanvasActivity>;
export const CanvasActivitySchema =
  SchemaFactory.createForClass(CanvasActivity);
CanvasActivitySchema.index({ projectId: 1, updatedAt: -1 });
CanvasActivitySchema.index({ projectId: 1, 'actor.userId': 1, updatedAt: -1 });
CanvasActivitySchema.index({
  projectId: 1,
  'onBehalfOf.userId': 1,
  updatedAt: -1,
});

/** Última vez que una persona estuvo conectada a un proyecto: base de «desde tu última conexión». */
@Schema({ collection: 'project_presence', timestamps: true })
export class ProjectPresence {
  @Prop({ required: true })
  projectId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  lastSeenAt: Date;
}
export type ProjectPresenceDocument = HydratedDocument<ProjectPresence>;
export const ProjectPresenceSchema =
  SchemaFactory.createForClass(ProjectPresence);
ProjectPresenceSchema.index({ projectId: 1, userId: 1 }, { unique: true });
