import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    example: 'Sistema de Facturacion',
    description: 'Nombre del proyecto',
  })
  @IsString({ message: 'El nombre del proyecto debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del proyecto es obligatorio' })
  @MaxLength(120, { message: 'El nombre no puede exceder los 120 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example: 'Modelado UML y backend Spring Boot para facturación electrónica',
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  description?: string;

  @ApiPropertyOptional({
    example: 'com.uagrm.facturacion',
    default: 'com.example.app',
  })
  @IsOptional()
  @IsString({ message: 'El paquete base debe ser una cadena de texto válida' })
  @MaxLength(150)
  basePackage?: string = 'com.example.app';

  @ApiPropertyOptional({ example: 21, default: 21 })
  @IsOptional()
  @IsInt({ message: 'La versión de Java debe ser un número entero (17 o 21)' })
  @Min(17)
  @Max(25)
  javaVersion?: number = 21;

  @ApiPropertyOptional({ example: '3.3.0', default: '3.3.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  springBootVersion?: string = '3.3.0';
}
