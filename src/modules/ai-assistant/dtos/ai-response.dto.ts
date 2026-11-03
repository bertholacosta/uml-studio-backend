import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatMessageDto } from './ai-chat.dto';

export class AiResponseDto {
  @ApiProperty({
    description:
      'Indica si la mutación fue exitosa o si se requirió aclaración',
  })
  success: boolean;

  @ApiProperty({
    description: 'Tipo de acción ejecutada',
    example:
      'answer | diagram_mutated | proposal | clarification_required | vision_extract | error',
  })
  action: string;

  @ApiProperty({
    description:
      'Mensaje descriptivo en lenguaje natural de los cambios realizados o aclaración solicitada',
  })
  message: string;

  @ApiProperty({
    description: 'Lista actualizada de nodos del diagrama',
    type: [Object],
  })
  nodes: any[];

  @ApiProperty({
    description: 'Lista actualizada de conexiones del diagrama',
    type: [Object],
  })
  connections: any[];

  @ApiProperty({
    description: 'Resumen conciso de cambios estructurales aplicados',
    example:
      'Se creó la clase Producto con 3 atributos y relación hacia Categoria',
  })
  changesSummary: string;

  @ApiProperty({
    description: 'Nombre del modelo de IA que procesó la solicitud',
    example: 'gemini-3.8-flash',
    required: false,
  })
  modelUsed?: string;

  @ApiPropertyOptional({
    description:
      'Mensaje del colaborador guardado en la conversación compartida',
    type: ChatMessageDto,
  })
  userMessage?: ChatMessageDto;

  @ApiPropertyOptional({
    description: 'Respuesta de Trazo guardada en la conversación compartida',
    type: ChatMessageDto,
  })
  assistantMessage?: ChatMessageDto;
}
