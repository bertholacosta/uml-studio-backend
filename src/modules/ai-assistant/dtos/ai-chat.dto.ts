import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

class ChatAuthorDto {
  @ApiProperty()
  userId: string;

  @ApiProperty({ example: 'Ana Pérez' })
  userName: string;
}

class ChatProposalDto {
  @ApiProperty({ enum: ['pending', 'applied'] })
  state: 'pending' | 'applied';

  @ApiPropertyOptional({ type: ChatAuthorDto })
  appliedBy?: ChatAuthorDto;

  @ApiPropertyOptional()
  appliedAt?: Date;
}

/** Mensaje de la conversación compartida con Trazo, tal como lo ve cada colaborador. */
export class ChatMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @ApiProperty({ type: ChatAuthorDto })
  author: ChatAuthorDto;

  @ApiProperty({
    example: 'Ana, un atributo derivado se calcula a partir de otros…',
  })
  text: string;

  @ApiPropertyOptional()
  clientId?: string;

  @ApiPropertyOptional()
  replyTo?: string;

  @ApiPropertyOptional({
    enum: ['answer', 'edit', 'propose', 'clarify', 'vision'],
  })
  intent?: string;

  @ApiProperty({ enum: ['success', 'clarification', 'error'] })
  status: string;

  @ApiPropertyOptional()
  changesSummary?: string;

  @ApiPropertyOptional({
    description: 'Número de operaciones propuestas o aplicadas',
  })
  operationsCount?: number;

  @ApiPropertyOptional({ type: ChatProposalDto })
  proposal?: ChatProposalDto;

  @ApiPropertyOptional({ description: 'Miniatura de la imagen adjunta' })
  image?: string;

  @ApiPropertyOptional({ example: 'trazo:latest' })
  model?: string;

  @ApiPropertyOptional()
  latencyMs?: number;

  @ApiProperty()
  createdAt: Date;
}

export class ConversationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  diagramId: string;

  @ApiProperty({ type: ChatAuthorDto })
  startedBy: ChatAuthorDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [ChatMessageDto] })
  messages: ChatMessageDto[];

  @ApiProperty({ description: 'Hay mensajes anteriores a los devueltos' })
  hasMore: boolean;
}

export class ConversationQueryDto {
  @ApiPropertyOptional({ default: 60, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Diagrama actual sobre el que se aplica una propuesta de Trazo. */
export class ApplyProposalDto {
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  currentNodes?: any[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  currentConnections?: any[];
}
