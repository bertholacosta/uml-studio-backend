import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '../entities/project-role.enum';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ProjectRole, example: ProjectRole.EDITOR })
  @IsNotEmpty({ message: 'El rol es obligatorio' })
  @IsEnum(ProjectRole, { message: 'El rol debe ser OWNER, EDITOR o VIEWER' })
  role: ProjectRole;
}
