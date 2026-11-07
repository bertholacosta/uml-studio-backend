import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CanvasActivity,
  CanvasActivitySchema,
  ProjectPresence,
  ProjectPresenceSchema,
} from './canvas-activity.schema';
import { ActivityService } from './activity.service';

/** Registro de quién hizo qué en los lienzos y de la última conexión de cada persona (MongoDB). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CanvasActivity.name, schema: CanvasActivitySchema },
      { name: ProjectPresence.name, schema: ProjectPresenceSchema },
    ]),
  ],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
