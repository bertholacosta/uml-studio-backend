import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AI_LIMIT, CHAT_LIMIT } from '../../../common/guards/throttle.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { AiAssistantService } from '../services/ai-assistant.service';
import { AiVisionPromptDto } from '../dtos/ai-request.dto';
import { AiResponseDto } from '../dtos/ai-response.dto';
import {
  ApplyProposalDto,
  ChatAcceptedDto,
  ConversationDto,
  ConversationQueryDto,
  ReviewChangeDto,
  SendChatMessageDto,
} from '../dtos/ai-chat.dto';
import type { ChatChannel } from '../conversation/ai-conversation.schema';
import {
  TrazoSettingsDto,
  UpdateTrazoSettingsDto,
} from '../dtos/trazo-settings.dto';
import { ProposalPreviewDto } from '../dtos/proposal-preview.dto';

enum ChannelParam {
  team = 'team',
  direct = 'direct',
}

const channelParam = new ParseEnumPipe(ChannelParam);

@ApiTags('chat')
@ApiBearerAuth()
@Controller()
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get('chat/projects/:projectId/:channel')
  @SkipThrottle()
  @ApiParam({ name: 'channel', enum: ChannelParam })
  @ApiOperation({
    summary:
      'Canal del equipo del proyecto (team) o conversación privada con Trazo (direct): últimos mensajes',
  })
  @ApiResponse({ status: 200, type: ConversationDto })
  async getConversation(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('channel', channelParam) channel: ChatChannel,
    @Query() query: ConversationQueryDto,
    @CurrentUser() user: User,
  ): Promise<ConversationDto> {
    return this.aiAssistantService.getConversation(
      projectId,
      channel,
      user,
      query.limit,
    );
  }

  @Post('chat/projects/:projectId/:channel/reset')
  @SkipThrottle()
  @ApiParam({ name: 'channel', enum: ChannelParam })
  @ApiOperation({
    summary:
      'Empieza una conversación nueva (la anterior queda guardada). El canal del equipo solo lo reinicia el administrador',
  })
  @ApiResponse({ status: 201, type: ConversationDto })
  @ApiResponse({
    status: 403,
    description: 'Solo el administrador reinicia el canal del equipo',
  })
  async startConversation(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('channel', channelParam) channel: ChatChannel,
    @CurrentUser() user: User,
  ): Promise<ConversationDto> {
    return this.aiAssistantService.startConversation(projectId, channel, user);
  }

  @Post('chat/projects/:projectId/messages')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: CHAT_LIMIT })
  @ApiOperation({
    summary: 'Envía un mensaje al canal del equipo o a la conversación privada',
    description:
      'En el canal del equipo, Trazo solo responde si se le menciona con @Trazo; en la conversación privada responde siempre. Con #Diagrama se indica el lienzo; si no, Trazo usa el diagrama abierto, el que contiene las clases mencionadas o el del hilo, y si no lo sabe pregunta. Su respuesta llega por Socket.IO (evento chat_message).',
  })
  @ApiResponse({ status: 202, type: ChatAcceptedDto })
  async sendMessage(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user: User,
  ): Promise<ChatAcceptedDto> {
    const { message, result } = await this.aiAssistantService.submitMessage(
      projectId,
      dto,
      user,
    );
    return { status: result ? 'queued' : 'sent', message };
  }

  @Get('projects/:projectId/trazo-settings')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Configuración de Trazo del proyecto: cómo entrega los cambios, estilo y modelo',
  })
  @ApiResponse({ status: 200, type: TrazoSettingsDto })
  async getTrazoSettings(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: User,
  ): Promise<TrazoSettingsDto> {
    return this.aiAssistantService.getTrazoSettings(projectId, user);
  }

  @Put('projects/:projectId/trazo-settings')
  @Throttle({ default: CHAT_LIMIT })
  @ApiOperation({
    summary: 'Cambia la configuración de Trazo del proyecto',
    description:
      'Solo editores y administrador. Trazo anuncia el cambio en el canal del equipo y los paneles abiertos lo reciben por Socket.IO (evento trazo_settings). Trazo sigue actuando solo cuando le hablan.',
  })
  @ApiResponse({ status: 200, type: TrazoSettingsDto })
  @ApiResponse({ status: 400, description: 'Modelo no disponible' })
  @ApiResponse({ status: 403, description: 'Solo lectura' })
  async updateTrazoSettings(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateTrazoSettingsDto,
    @CurrentUser() user: User,
  ): Promise<TrazoSettingsDto> {
    return this.aiAssistantService.updateTrazoSettings(projectId, dto, user);
  }

  @Post('chat/messages/:messageId/preview')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Vista previa de una propuesta de Trazo: cómo quedaría el diagrama, sin guardarlo',
  })
  @ApiResponse({ status: 200, type: ProposalPreviewDto })
  @ApiResponse({ status: 404, description: 'Propuesta no encontrada' })
  @ApiResponse({ status: 409, description: 'La propuesta ya se aplicó' })
  async previewProposal(
    @Param('messageId') messageId: string,
    @Body() dto: ApplyProposalDto,
    @CurrentUser() user: User,
  ): Promise<ProposalPreviewDto> {
    return this.aiAssistantService.previewProposal(messageId, dto, user);
  }

  @Post('chat/messages/:messageId/review')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CHAT_LIMIT })
  @ApiOperation({
    summary:
      'Acepta o deshace todo lo que Trazo cambió en el lienzo en un mensaje',
    description:
      'decision=accept deja los cambios y quita el resaltado; decision=revert deshace solo lo que tocó Trazo, sobre el diagrama actual (sin perder lo que el equipo cambió después).',
  })
  @ApiResponse({ status: 200, type: AiResponseDto })
  @ApiResponse({ status: 404, description: 'Cambio no encontrado' })
  @ApiResponse({ status: 409, description: 'El cambio ya se revisó' })
  async reviewChange(
    @Param('messageId') messageId: string,
    @Body() dto: ReviewChangeDto,
    @CurrentUser() user: User,
  ): Promise<AiResponseDto> {
    return this.aiAssistantService.reviewChange(messageId, dto, user);
  }

  @Post('chat/messages/:messageId/apply')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CHAT_LIMIT })
  @ApiOperation({
    summary: 'Aplica a su diagrama los cambios que Trazo propuso en un mensaje',
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

  @Post('ai/vision-diagram')
  @HttpCode(HttpStatus.ACCEPTED)
  // Cada imagen ocupa el servidor de IA
  @Throttle({ default: AI_LIMIT })
  @ApiOperation({
    summary:
      'Trazo digitaliza en un diagrama un diagrama UML de una imagen (foto, pizarra o captura)',
    description:
      'La imagen se publica en el canal indicado y el resultado llega por Socket.IO.',
  })
  @ApiResponse({ status: 202, type: ChatAcceptedDto })
  @ApiResponse({
    status: 403,
    description: 'El usuario no puede editar el diagrama',
  })
  async processVisionDiagram(
    @Body() dto: AiVisionPromptDto,
    @CurrentUser() user: User,
  ): Promise<ChatAcceptedDto> {
    const { message } = await this.aiAssistantService.submitVisionDiagram(
      dto,
      user,
    );
    return { status: 'queued', message };
  }
}
