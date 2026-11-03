import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DiagramService } from '../services/diagram.service';
import { CreateDiagramDto } from '../dtos/create-diagram.dto';
import { UpdateDiagramDto } from '../dtos/update-diagram.dto';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('diagrams')
@ApiBearerAuth()
@Controller('diagrams')
export class DiagramController {
  constructor(private readonly diagramService: DiagramService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo diagrama dentro de un proyecto' })
  @ApiResponse({
    status: 201,
    description: 'Diagrama creado exitosamente',
    type: DiagramResponseDto,
  })
  async create(
    @Body() dto: CreateDiagramDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.create(dto, user.id);
  }

  @Get('project/:projectId')
  @ApiOperation({
    summary: 'Listar todos los diagramas pertenecientes a un proyecto',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de diagramas del proyecto',
    type: [DiagramResponseDto],
  })
  async findAllByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto[]> {
    return this.diagramService.findAllByProjectId(projectId, user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener un diagrama completo con sus nodos y conexiones (AST)',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagrama y AST cargados',
    type: DiagramResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Diagrama no encontrado' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.findOne(id, user.id);
  }

  @Put(':id/ast')
  @ApiOperation({
    summary:
      'Guardar y sincronizar el AST completo del diagrama (nodos, atributos, métodos, relaciones)',
  })
  @ApiResponse({
    status: 200,
    description: 'AST persistido exitosamente en base de datos',
    type: DiagramResponseDto,
  })
  async saveAst(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() astDto: SaveDiagramAstDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.saveAst(id, astDto, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar metadatos del diagrama (nombre y versión)',
  })
  @ApiResponse({
    status: 200,
    description: 'Diagrama actualizado',
    type: DiagramResponseDto,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiagramDto,
    @CurrentUser() user: User,
  ): Promise<DiagramResponseDto> {
    return this.diagramService.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un diagrama' })
  @ApiResponse({ status: 200, description: 'Diagrama eliminado' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean; message: string }> {
    return this.diagramService.remove(id, user.id);
  }
}
