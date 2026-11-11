import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_ROLE_LENGTH,
  UML_NAVIGABILITIES,
  UML_VISIBILITIES,
} from '../uml-notation';

// Topes de tamaño de un diagrama: muy por encima del uso normal, evitan cargas abusivas
export const MAX_NODES = 500;
export const MAX_CONNECTIONS = 1000;
export const MAX_MEMBERS = 200;

export class UmlAttributeDto {
  @ApiProperty({ example: 'id' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'UUID' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ enum: UML_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn(UML_VISIBILITIES)
  visibility?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  orderIndex?: number = 0;
}

export class UmlMethodDto {
  @ApiProperty({ example: 'calcularTotal' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'descuento: double' })
  @IsOptional()
  @IsString()
  parameters?: string = '';

  @ApiProperty({ example: 'BigDecimal' })
  @IsString()
  @IsNotEmpty()
  returnType: string;

  @ApiPropertyOptional({ enum: UML_VISIBILITIES, default: 'public' })
  @IsOptional()
  @IsIn(UML_VISIBILITIES)
  visibility?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  orderIndex?: number = 0;
}

export class UmlNodeDto {
  @ApiProperty({ example: 'node_1740000000' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Factura' })
  @ValidateIf((o: UmlNodeDto) => !o.isAnchor)
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  positionX: number;

  @ApiProperty({ example: 150 })
  @IsNumber()
  positionY: number;

  @ApiPropertyOptional({ example: 220, default: 220 })
  @IsOptional()
  @IsNumber()
  width?: number = 220;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @IsNumber()
  height?: number | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isAnchor?: boolean = false;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  assocMainConnId?: string | null;

  @ApiPropertyOptional({ type: [UmlAttributeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBERS)
  @ValidateNested({ each: true })
  @Type(() => UmlAttributeDto)
  attributes?: UmlAttributeDto[] = [];

  @ApiPropertyOptional({ type: [UmlMethodDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEMBERS)
  @ValidateNested({ each: true })
  @Type(() => UmlMethodDto)
  methods?: UmlMethodDto[] = [];
}

export class UmlConnectionDto {
  @ApiProperty({ example: 'conn_1740000000' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'node_1' })
  @IsString()
  @IsNotEmpty()
  sourceNodeId: string;

  @ApiProperty({ example: 'node_2' })
  @IsString()
  @IsNotEmpty()
  targetNodeId: string;

  @ApiProperty({ example: 'node_1_right' })
  @IsString()
  @IsNotEmpty()
  sourceId: string;

  @ApiProperty({ example: 'node_2_left' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ example: 'association' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({ example: 'posee' })
  @IsOptional()
  @IsString()
  name?: string | null;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  sourceMultiplicity?: string = '1';

  @ApiPropertyOptional({ example: '0..*' })
  @IsOptional()
  @IsString()
  targetMultiplicity?: string = '0..*';

  @ApiPropertyOptional({ example: 'jefe' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ROLE_LENGTH)
  sourceRole?: string | null;

  @ApiPropertyOptional({ example: 'subordinados' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ROLE_LENGTH)
  targetRole?: string | null;

  @ApiPropertyOptional({ enum: UML_NAVIGABILITIES, default: 'unspecified' })
  @IsOptional()
  @IsIn(UML_NAVIGABILITIES)
  navigability?: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  assocAnchorNodeId?: string | null;
}

export class SaveDiagramAstDto {
  @ApiProperty({ type: [UmlNodeDto] })
  @IsArray()
  @ArrayMaxSize(MAX_NODES)
  @ValidateNested({ each: true })
  @Type(() => UmlNodeDto)
  nodes: UmlNodeDto[];

  @ApiProperty({ type: [UmlConnectionDto] })
  @IsArray()
  @ArrayMaxSize(MAX_CONNECTIONS)
  @ValidateNested({ each: true })
  @Type(() => UmlConnectionDto)
  connections: UmlConnectionDto[];
}
