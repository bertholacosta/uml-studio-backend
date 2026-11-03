import {
  Controller,
  Post,
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
import { ProjectMemberService } from '../services/project-member.service';
import { AddMemberDto } from '../dtos/add-member.dto';
import { UpdateMemberRoleDto } from '../dtos/update-member-role.dto';
import { ProjectMemberResponseDto } from '../dtos/project-member-response.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects/:id/members')
export class ProjectMemberController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Invitar/agregar un miembro colaborador al proyecto por correo',
  })
  @ApiResponse({
    status: 201,
    description: 'Miembro agregado exitosamente',
    type: ProjectMemberResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o usuario ya es miembro',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el OWNER o roles autorizados pueden invitar miembros',
  })
  @ApiResponse({
    status: 404,
    description: 'Proyecto o usuario a invitar no encontrado',
  })
  async addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: User,
  ): Promise<ProjectMemberResponseDto> {
    return this.projectMemberService.addMember(id, dto, user.id);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Actualizar el rol de un miembro colaborador' })
  @ApiResponse({
    status: 200,
    description: 'Rol actualizado exitosamente',
    type: ProjectMemberResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'No se puede cambiar el rol del OWNER',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el OWNER puede modificar roles',
  })
  @ApiResponse({ status: 404, description: 'Miembro no encontrado' })
  async updateMemberRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: User,
  ): Promise<ProjectMemberResponseDto> {
    return this.projectMemberService.updateMemberRole(id, userId, dto, user.id);
  }

  @Delete(':userId')
  @ApiOperation({
    summary: 'Remover un miembro del proyecto o abandonar el proyecto',
  })
  @ApiResponse({ status: 200, description: 'Miembro removido exitosamente' })
  @ApiResponse({
    status: 400,
    description: 'El OWNER no puede ser removido ni abandonar el proyecto',
  })
  @ApiResponse({
    status: 403,
    description: 'Permisos insuficientes para remover al miembro',
  })
  @ApiResponse({ status: 404, description: 'Miembro no encontrado' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean; message: string }> {
    return this.projectMemberService.removeMember(id, userId, user.id);
  }
}
