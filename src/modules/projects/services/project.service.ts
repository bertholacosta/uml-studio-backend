import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { CreateProjectDto } from '../dtos/create-project.dto';
import { UpdateProjectDto } from '../dtos/update-project.dto';
import { ProjectResponseDto } from '../dtos/project-response.dto';
import { ProjectRole } from '../entities/project-role.enum';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,
    @Inject(forwardRef(() => DiagramRepository))
    private readonly diagramRepository: DiagramRepository,
  ) {}

  async create(
    dto: CreateProjectDto,
    userId: string,
  ): Promise<ProjectResponseDto> {
    const projectEntity = this.projectRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim(),
      basePackage: dto.basePackage || 'com.example.app',
      javaVersion: dto.javaVersion || 21,
      springBootVersion: dto.springBootVersion || '3.3.0',
      createdBy: userId,
    });

    const savedProject = await this.projectRepository.save(projectEntity);

    // Agregar creador como OWNER en project_members
    const ownerMember = this.projectMemberRepository.create({
      projectId: savedProject.id,
      userId,
      role: ProjectRole.OWNER,
    });
    await this.projectMemberRepository.save(ownerMember);

    // Crear un diagrama inicial por defecto dentro del proyecto
    const defaultDiagram = this.diagramRepository.create({
      projectId: savedProject.id,
      name: `${savedProject.name}`,
      version: '1.0.0',
    });
    await this.diagramRepository.save(defaultDiagram);

    const fullProject = await this.projectRepository.findById(savedProject.id);
    return ProjectResponseDto.fromEntity(fullProject!, userId);
  }

  async findAllForUser(userId: string): Promise<ProjectResponseDto[]> {
    const projects = await this.projectRepository.findAllForUser(userId);
    return projects.map((p) => ProjectResponseDto.fromEntity(p, userId));
  }

  async findOne(id: string, userId: string): Promise<ProjectResponseDto> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const role = await this.projectMemberRepository.findRole(id, userId);
    if (!role && project.createdBy !== userId) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este proyecto',
      );
    }

    return ProjectResponseDto.fromEntity(project, userId);
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    userId: string,
  ): Promise<ProjectResponseDto> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const role = await this.projectMemberRepository.findRole(id, userId);
    if (!role || (role !== ProjectRole.OWNER && role !== ProjectRole.EDITOR)) {
      throw new ForbiddenException(
        'Solo los propietarios o editores pueden modificar el proyecto',
      );
    }

    await this.projectRepository.update(id, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.basePackage && { basePackage: dto.basePackage }),
      ...(dto.javaVersion && { javaVersion: dto.javaVersion }),
      ...(dto.springBootVersion && {
        springBootVersion: dto.springBootVersion,
      }),
    });

    const updated = await this.projectRepository.findById(id);
    return ProjectResponseDto.fromEntity(updated!, userId);
  }

  async remove(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    const role = await this.projectMemberRepository.findRole(id, userId);
    if (role !== ProjectRole.OWNER && project.createdBy !== userId) {
      throw new ForbiddenException(
        'Solo el propietario puede eliminar el proyecto',
      );
    }

    await this.projectRepository.delete(id);
    return { success: true, message: 'Proyecto eliminado exitosamente' };
  }
}
