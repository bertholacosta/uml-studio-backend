import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'Ing. Carlos Mendez',
    description: 'Nombre completo del usuario',
  })
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre completo no puede estar vacío' })
  @MaxLength(100, { message: 'El nombre no puede exceder los 100 caracteres' })
  fullName: string;

  @ApiProperty({
    example: 'carlos.mendez@example.com',
    description: 'Correo electrónico único',
  })
  @IsEmail({}, { message: 'Debe proporcionar un correo electrónico válido' })
  @IsNotEmpty({ message: 'El correo electrónico no puede estar vacío' })
  @MaxLength(150, { message: 'El correo no puede exceder los 150 caracteres' })
  email: string;

  @ApiProperty({
    example: 'Pass1234!',
    description: 'Contraseña de al menos 6 caracteres',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña no puede estar vacía' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;
}
