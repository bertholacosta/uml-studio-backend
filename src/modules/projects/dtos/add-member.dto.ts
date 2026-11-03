import { IsEmail, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectRole } from '../entities/project-role.enum';

export class AddMemberDto {
  @ApiProperty({
    example: 'colaborador@uagrm.edu.bo',
    description: 'Correo del usuario a invitar',
  })
  @IsEmail({}, { message: 'Debe proporcionar un correo electrónico válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  email: string;

  @ApiPropertyOptional({
    enum: ProjectRole,
    default: ProjectRole.EDITOR,
    description: 'Rol dentro del proyecto',
  })
  @IsOptional()
  @IsEnum(ProjectRole, { message: 'El rol debe ser OWNER, EDITOR o VIEWER' })
  role?: ProjectRole = ProjectRole.EDITOR;
}
