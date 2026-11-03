import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AI_LIMIT } from '../../../common/guards/throttle.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { AiAssistantService } from '../services/ai-assistant.service';
import { AiPromptDto, AiVisionPromptDto } from '../dtos/ai-request.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';
import {
  AiAcceptedDto,
  ApplyProposalDto,
  ConversationDto,
  ConversationQueryDto,
} from '../dtos/ai-chat.dto';

@ApiTags('ai')
// Cada llamada ocupa el servidor de IA
@Throttle({ default: AI_LIMIT })
@ApiBearerAuth()
@Controller('ai')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get('diagrams/:diagramId/conversation')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Conversación compartida con Trazo en la pizarra del diagrama (últimos mensajes)',
  })
  @ApiResponse({ status: 200, type: ConversationDto })
  async getConversation(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @Query() query: ConversationQueryDto,
    @CurrentUser() user: User,
  ): Promise<ConversationDto> {
    return this.aiAssistantService.getConversation(
      diagramId,
      user,
      query.limit,
    );
  }

  @Post('diagrams/:diagramId/conversation')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Empieza una conversación nueva para toda la pizarra (la anterior queda guardada)',
  })
  @ApiResponse({ status: 201, type: ConversationDto })
  @ApiResponse({
    status: 403,
    description: 'El usuario no puede editar el diagrama',
  })
  async startConversation(
    @Param('diagramId', ParseUUIDPipe) diagramId: string,
    @CurrentUser() user: User,
  ): Promise<ConversationDto> {
    return this.aiAssistantService.startConversation(diagramId, user);
  }

  @Post('prompt')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Pregunta o instrucción a Trazo: responde como mentor, propone cambios o edita el diagrama',
    description:
      'Devuelve al instante el mensaje guardado; la respuesta de Trazo (y el diagrama modificado, si lo hay) llega a toda la pizarra por Socket.IO: eventos ai_message y diagram_synced.',
  })
  @ApiResponse({
    status: 202,
    description: 'Mensaje aceptado y en la cola de Trazo',
    type: AiAcceptedDto,
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no tiene acceso al diagrama',
  })
  async processPrompt(
    @Body() dto: AiPromptDto,
    @CurrentUser() user: User,
  ): Promise<AiAcceptedDto> {
    const { userMessage } = await this.aiAssistantService.submitTextPrompt(
      dto,
      user,
    );
    return { status: 'queued', userMessage };
  }

  @Post('messages/:messageId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aplica al diagrama los cambios que Trazo propuso en un mensaje',
  })
  @ApiResponse({ status: 200, type: AiResponseDto })
  @ApiResponse({ status: 404, description: 'Propuesta no encontrada' })
  @ApiResponse({ status: 409, description: 'La propuesta ya se aplicó' })
  async applyProposal(
    @Param('messageId') messageId: string,
    @Body() dto: ApplyProposalDto,
    @CurrentUser() user: User,
  ): Promise<AiResponseDto> {
    return this.aiAssistantService.applyProposal(messageId, dto, user);
  }

  @Post('vision-diagram')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Trazo digitaliza un diagrama UML desde una imagen (foto, pizarra o captura)',
    description:
      'Devuelve al instante; el diagrama digitalizado llega por Socket.IO como en /ai/prompt.',
  })
  @ApiResponse({
    status: 202,
    description: 'Imagen aceptada y en la cola de Trazo',
    type: AiAcceptedDto,
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no puede editar el diagrama',
  })
  async processVisionDiagram(
    @Body() dto: AiVisionPromptDto,
    @CurrentUser() user: User,
  ): Promise<AiAcceptedDto> {
    const { userMessage } = await this.aiAssistantService.submitVisionDiagram(
      dto,
      user,
    );
    return { status: 'queued', userMessage };
  }
}
