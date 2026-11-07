import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatAuthor } from '../conversation/ai-conversation.schema';
import { TrazoSettings, TrazoSettingsDocument } from './trazo-settings.schema';
import { DEFAULT_TRAZO_SETTINGS, TrazoSettingsValues } from './trazo-settings';

/** Configuración guardada de un proyecto, con quién la cambió por última vez. */
export interface StoredTrazoSettings extends TrazoSettingsValues {
  updatedBy?: ChatAuthor;
  updatedAt?: Date;
}

/** Guarda en MongoDB cómo trabaja Trazo en cada proyecto (colección trazo_settings). */
@Injectable()
export class TrazoSettingsService {
  constructor(
    @InjectModel(TrazoSettings.name)
    private readonly model: Model<TrazoSettingsDocument>,
  ) {}

  /** La configuración del proyecto; sin guardar, la predeterminada. */
  async get(projectId: string): Promise<StoredTrazoSettings> {
    const doc = await this.model.findOne({ projectId }).lean().exec();
    if (!doc) return { ...DEFAULT_TRAZO_SETTINGS };
    return {
      delivery: doc.delivery,
      style: doc.style,
      creativity: doc.creativity,
      ...(doc.model ? { model: doc.model } : {}),
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    };
  }

  /** Guarda la configuración completa (sin modelo, vuelve al predeterminado). */
  async save(
    projectId: string,
    values: TrazoSettingsValues,
    by: ChatAuthor,
  ): Promise<StoredTrazoSettings> {
    const fields = {
      delivery: values.delivery,
      style: values.style,
      creativity: values.creativity,
      updatedBy: by,
    };
    const doc = await this.model
      .findOneAndUpdate(
        { projectId },
        values.model
          ? { $set: { ...fields, model: values.model } }
          : { $set: fields, $unset: { model: 1 } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return {
      delivery: doc.delivery,
      style: doc.style,
      creativity: doc.creativity,
      ...(doc.model ? { model: doc.model } : {}),
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    };
  }
}
