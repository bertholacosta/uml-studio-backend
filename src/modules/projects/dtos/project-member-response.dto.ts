import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '../entities/project-role.enum';
import { ProjectMember } from '../entities/project-member.entity';

export class ProjectMemberResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId: string;

  @ApiProperty({ example: 'Ing. Carlos Mendez' })
  fullName: string;

  @ApiProperty({ example: 'carlos.mendez@example.com' })
  email: string;

  @ApiProperty({ enum: ProjectRole, example: ProjectRole.EDITOR })
  role: ProjectRole;

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z' })
  joinedAt: Date;

  static fromEntity(member: ProjectMember): ProjectMemberResponseDto {
    const dto = new ProjectMemberResponseDto();
    dto.id = member.id;
    dto.userId = member.userId;
    dto.fullName = member.user?.fullName || '';
    dto.email = member.user?.email || '';
    dto.role = member.role;
    dto.joinedAt = member.joinedAt;
    return dto;
  }
}
