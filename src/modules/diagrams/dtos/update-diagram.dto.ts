import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDiagramDto {
  @ApiPropertyOptional({ example: 'Diagrama de Dominio v2' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: '1.1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;
}
