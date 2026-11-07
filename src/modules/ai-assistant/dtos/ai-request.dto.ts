import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const MAX_NODES = 500;
const MAX_CONNECTIONS = 1000;

/**
 * Contexto común de toda petición a Trazo: el diagrama actual. La conversación no viaja
 * en la petición: el servidor la guarda en MongoDB y la comparte entre los colaboradores.
 */
export class AiDiagramContextDto {
  @ApiProperty({
    description: 'Identificador del diagrama que se modifica',
    example: 'd9b736b4-2b62-4217-a068-d0a5180f9702',
  })
  @IsUUID()
  diagramId: string;

  @ApiPropertyOptional({
    description: 'Nodos actuales del diagrama',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_NODES)
  // Sin tipo, la conversión implícita de la validación convierte cada elemento en un Array
  @Type(() => Object)
  currentNodes?: any[];

  @ApiPropertyOptional({
    description: 'Conexiones actuales del diagrama',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CONNECTIONS)
  // Sin tipo, la conversión implícita de la validación convierte cada elemento en un Array
  @Type(() => Object)
  currentConnections?: any[];

  @ApiPropertyOptional({
    description:
      'Id temporal del mensaje en el navegador, para reemplazar el mensaje provisional',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}

export class AiPromptDto extends AiDiagramContextDto {
  @ApiProperty({
    description:
      'Pregunta o instrucción en lenguaje natural (escrita o dictada por voz)',
    example:
      'Crea una tabla Producto con id UUID, nombre String y precio Double y relaciónala muchos a uno con Categoria',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  prompt: string;
}

export class AiVisionPromptDto extends AiDiagramContextDto {
  @ApiPropertyOptional({
    enum: ['team', 'direct'],
    default: 'team',
    description: 'Conversación en la que se publica la imagen',
  })
  @IsOptional()
  @IsIn(['team', 'direct'])
  channel?: 'team' | 'direct';

  @ApiProperty({
    description: 'Imagen del diagrama en Base64 (admite data URI)',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsString()
  @IsNotEmpty()
  imageBase64: string;

  @ApiProperty({ description: 'Tipo MIME de la imagen', example: 'image/png' })
  @IsString()
  @IsIn(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
  mimeType: string;

  @ApiPropertyOptional({
    description: 'Indicación adicional para la digitalización',
    example: 'Digitaliza todas las clases del pizarrón',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;
}
