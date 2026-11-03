import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportXmiDto {
  @ApiProperty({
    description:
      'Contenido XML/XMI 2.1 estándar de Enterprise Architect u otra herramienta CASE',
    example:
      '<?xml version="1.0" encoding="windows-1252"?>\n<xmi:XMI xmi:version="2.1" ...>...</xmi:XMI>',
  })
  @IsString()
  @IsNotEmpty({ message: 'El contenido XMI no puede estar vacío.' })
  xmiContent: string;

  @ApiPropertyOptional({
    description:
      'ID del diagrama existente a actualizar en base de datos (opcional)',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El diagramId debe ser un UUID v4 válido.' })
  diagramId?: string;

  @ApiPropertyOptional({
    description:
      'ID del proyecto donde crear un nuevo diagrama (si no se provee diagramId)',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El projectId debe ser un UUID v4 válido.' })
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Nombre asignado al diagrama importado',
    example: 'Diagrama Importado desde Enterprise Architect',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  diagramName?: string;
}
