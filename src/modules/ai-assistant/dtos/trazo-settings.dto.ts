import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  TRAZO_CREATIVITIES,
  TRAZO_DELIVERIES,
  TRAZO_STYLES,
  type TrazoCreativity,
  type TrazoDelivery,
  type TrazoStyle,
} from '../settings/trazo-settings';

class SettingsAuthorDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ example: 'Ana Pérez' })
  userName: string;
}

/** Cambio de la configuración de Trazo del proyecto (solo editores y administrador). */
export class UpdateTrazoSettingsDto {
  @ApiProperty({
    enum: TRAZO_DELIVERIES,
    description:
      'apply: aplica los cambios pedidos; propose: siempre los deja como propuesta; explain: solo explica, sin tocar el diagrama',
  })
  @IsIn(TRAZO_DELIVERIES)
  delivery: TrazoDelivery;

  @ApiProperty({
    enum: TRAZO_STYLES,
    description:
      'brief: breve y directo; mentor: explica el porqué y hace preguntas',
  })
  @IsIn(TRAZO_STYLES)
  style: TrazoStyle;

  @ApiProperty({
    enum: TRAZO_CREATIVITIES,
    description:
      'Temperatura del modelo: precise 0,05 · balanced 0,2 · creative 0,6',
  })
  @IsIn(TRAZO_CREATIVITIES)
  creativity: TrazoCreativity;

  @ApiPropertyOptional({
    description:
      'Uno de los modelos de «models»; vacío o ausente usa el predeterminado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}

/** Configuración de Trazo del proyecto y lo que se puede elegir. */
export class TrazoSettingsDto extends UpdateTrazoSettingsDto {
  @ApiProperty({
    type: [String],
    description:
      'Modelos que se pueden elegir; el primero es el predeterminado',
  })
  models: string[];

  @ApiProperty({ description: 'Si quien consulta puede cambiarla' })
  canEdit: boolean;

  @ApiPropertyOptional({ type: SettingsAuthorDto })
  updatedBy?: SettingsAuthorDto;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
