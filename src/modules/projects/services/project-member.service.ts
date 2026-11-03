import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { AddMemberDto } from '../dtos/add-member.dto';
import { UpdateMemberRoleDto } from '../dtos/update-member-role.dto';
import { ProjectMemberResponseDto } from '../dtos/project-member-response.dto';
import { ProjectRole } from '../entities/project-role.enum';

@Injectable()
export class ProjectMemberService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async addMember(
    projectId: string,
    dto: AddMemberDto,
    currentUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const currentRole = await this.projectMemberRepository.findRole(
      projectId,
      currentUserId,
    );
    if (
      currentRole !== ProjectRole.OWNER &&
      project.createdBy !== currentUserId
    ) {
      throw new ForbiddenException(
        'Solo el propietario puede agregar miembros al proyecto',
      );
    }

    const targetUser = await this.userRepository.findByEmail(
      dto.email.trim().toLowerCase(),
    );
    if (!targetUser) {
      throw new NotFoundException(
        `No se encontró ningún usuario con el correo: ${dto.email}`,
      );
    }

    const existingMember =
      await this.projectMemberRepository.findByProjectIdAndUserId(
        projectId,
        targetUser.id,
      );
    if (existingMember) {
      throw new ConflictException('El usuario ya es miembro de este proyecto');
    }

    const newMemberEntity = this.projectMemberRepository.create({
      projectId,
      userId: targetUser.id,
      role: dto.role || ProjectRole.EDITOR,
    });
    const savedMember =
      await this.projectMemberRepository.save(newMemberEntity);
    savedMember.user = targetUser;

    return ProjectMemberResponseDto.fromEntity(savedMember);
  }

  async updateMemberRole(
    projectId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    currentUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const currentRole = await this.projectMemberRepository.findRole(
      projectId,
      currentUserId,
    );
    if (
      currentRole !== ProjectRole.OWNER &&
      project.createdBy !== currentUserId
    ) {
      throw new ForbiddenException(
        'Solo el propietario puede cambiar los roles de los miembros',
      );
    }

    if (project.createdBy === targetUserId) {
      throw new BadRequestException(
        'No puedes cambiar el rol del creador principal del proyecto',
      );
    }

    const member = await this.projectMemberRepository.findByProjectIdAndUserId(
      projectId,
      targetUserId,
    );
    if (!member) {
      throw new NotFoundException('El usuario no es miembro de este proyecto');
    }

    await this.projectMemberRepository.updateRole(
      projectId,
      targetUserId,
      dto.role,
    );
    const updated = await this.projectMemberRepository.findByProjectIdAndUserId(
      projectId,
      targetUserId,
    );
    return ProjectMemberResponseDto.fromEntity(updated!);
  }

  async removeMember(
    projectId: string,
    targetUserId: string,
    currentUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const currentRole = await this.projectMemberRepository.findRole(
      projectId,
      currentUserId,
    );
    const isOwner =
      currentRole === ProjectRole.OWNER || project.createdBy === currentUserId;
    const isSelf = targetUserId === currentUserId;

    if (!isOwner && !isSelf) {
      throw new ForbiddenException(
        'No tienes permisos para remover a este miembro',
      );
    }

    if (project.createdBy === targetUserId) {
      throw new BadRequestException(
        'El creador principal no puede abandonar el proyecto',
      );
    }

    const member = await this.projectMemberRepository.findByProjectIdAndUserId(
      projectId,
      targetUserId,
    );
    if (!member) {
      throw new NotFoundException('El usuario no es miembro de este proyecto');
    }

    await this.projectMemberRepository.delete(projectId, targetUserId);
    return { success: true, message: 'Miembro removido exitosamente' };
  }
}
