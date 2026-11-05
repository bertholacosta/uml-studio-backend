import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ChatChannel } from '../conversation/ai-conversation.schema';

const MAX_NODES = 500;
const MAX_CONNECTIONS = 1000;

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

/** Mensaje del canal del equipo o de una conversación privada con Trazo. */
export class ChatMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty({ enum: ['team', 'direct'] })
  channel: ChatChannel;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @ApiProperty({ type: ChatAuthorDto })
  author: ChatAuthorDto;

  @ApiProperty({
    example: 'Ana, un atributo derivado se calcula a partir de otros…',
  })
  text: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de las personas mencionadas con @ (ai_assistant = Trazo)',
  })
  mentions?: string[];

  @ApiPropertyOptional({
    description: 'Diagrama sobre el que trabajó Trazo o al que se refiere',
  })
  diagramId?: string;

  @ApiPropertyOptional({ example: 'Ventas' })
  diagramName?: string;

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

/**
 * Respuesta inmediata al enviar un mensaje. Si llamó a Trazo («queued»), su respuesta llega
 * después por Socket.IO (evento chat_message).
 */
export class ChatAcceptedDto {
  @ApiProperty({ enum: ['sent', 'queued'] })
  status: 'sent' | 'queued';

  @ApiProperty({
    type: ChatMessageDto,
    description: 'Mensaje guardado en la conversación',
  })
  message: ChatMessageDto;
}

export class ConversationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty({ enum: ['team', 'direct'] })
  channel: ChatChannel;

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

/** Diagrama que el navegador tiene abierto: Trazo lo usa si es el lienzo sobre el que trabaja. */
export class OpenDiagramDto {
  @ApiPropertyOptional({
    description: 'Diagrama abierto por quien escribe (si lo hay)',
  })
  @IsOptional()
  @IsUUID()
  activeDiagramId?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_NODES)
  currentNodes?: any[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CONNECTIONS)
  currentConnections?: any[];
}

/** Mensaje para el canal del equipo o para la conversación privada con Trazo. */
export class SendChatMessageDto extends OpenDiagramDto {
  @ApiProperty({ enum: ['team', 'direct'], example: 'team' })
  @IsIn(['team', 'direct'])
  channel: ChatChannel;

  @ApiProperty({
    example: '@Trazo agrega la clase Factura con total y fecha en #Ventas',
    description:
      'En el canal del equipo, Trazo solo responde si se le menciona con @Trazo. Con #Diagrama se indica el lienzo.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  text: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Ids de las personas mencionadas con @',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  mentions?: string[];

  @ApiPropertyOptional({
    description:
      'Id temporal del mensaje en el navegador, para reemplazar el mensaje provisional',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}

/** Diagrama actual sobre el que se aplica una propuesta de Trazo. */
export class ApplyProposalDto extends OpenDiagramDto {}
