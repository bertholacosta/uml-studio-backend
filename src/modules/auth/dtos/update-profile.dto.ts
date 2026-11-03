import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'Nombre completo del usuario',
    example: 'Usuario Demo',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @ApiProperty({
    description: 'Nueva contraseña de la cuenta (mínimo 6 caracteres)',
    example: 'NewSecretPass123!',
    required: false,
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
