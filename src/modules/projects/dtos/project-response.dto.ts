import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectRole } from '../entities/project-role.enum';
import { Project } from '../entities/project.entity';
import { ProjectMemberResponseDto } from './project-member-response.dto';

export class ProjectResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Sistema de Facturacion' })
  name: string;

  @ApiPropertyOptional({ example: 'Modelado UML y backend Spring Boot' })
  description: string | null;

  @ApiProperty({ example: 'com.uagrm.facturacion' })
  basePackage: string;

  @ApiProperty({ example: 21 })
  javaVersion: number;

  @ApiProperty({ example: '3.3.0' })
  springBootVersion: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  createdBy: string;

  @ApiProperty({ example: 'Usuario Demo' })
  creatorName: string;

  @ApiPropertyOptional({ enum: ProjectRole, example: ProjectRole.OWNER })
  userRole?: ProjectRole;

  @ApiProperty({ example: 3 })
  memberCount: number;

  @ApiProperty({ example: 1 })
  diagramCount: number;

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ type: [ProjectMemberResponseDto] })
  members?: ProjectMemberResponseDto[];

  static fromEntity(
    project: Project,
    currentUserId?: string,
  ): ProjectResponseDto {
    const dto = new ProjectResponseDto();
    dto.id = project.id;
    dto.name = project.name;
    dto.description = project.description;
    dto.basePackage = project.basePackage;
    dto.javaVersion = project.javaVersion;
    dto.springBootVersion = project.springBootVersion;
    dto.createdBy = project.createdBy;
    dto.creatorName = project.creator?.fullName || '';
    dto.createdAt = project.createdAt;
    dto.memberCount = project.members?.length || 0;
    dto.diagramCount = project.diagrams?.length || 0;

    if (currentUserId && project.members) {
      const membership = project.members.find(
        (m) => m.userId === currentUserId,
      );
      dto.userRole = membership
        ? membership.role
        : project.createdBy === currentUserId
          ? ProjectRole.OWNER
          : undefined;
    }

    if (project.members) {
      dto.members = project.members.map((m) =>
        ProjectMemberResponseDto.fromEntity(m),
      );
    }

    return dto;
  }
}
