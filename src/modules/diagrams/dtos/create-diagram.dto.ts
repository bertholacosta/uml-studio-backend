import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDiagramDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID del proyecto contenedor',
  })
  @IsUUID('4', { message: 'El ID del proyecto debe ser un UUID válido' })
  @IsNotEmpty({ message: 'El ID del proyecto es obligatorio' })
  projectId: string;

  @ApiProperty({
    example: 'Diagrama de Dominio - Facturación',
    description: 'Nombre del diagrama',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del diagrama es obligatorio' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: '1.0.0', default: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string = '1.0.0';
}
