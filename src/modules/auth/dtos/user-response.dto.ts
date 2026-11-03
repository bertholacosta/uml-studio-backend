import { ApiProperty } from '@nestjs/swagger';
import { User } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty({ example: 'c0a80101-8b9a-4c92-8822-e4e4e4e4e4e4' })
  id: string;

  @ApiProperty({ example: 'Ing. Carlos Mendez' })
  fullName: string;

  @ApiProperty({ example: 'carlos.mendez@example.com' })
  email: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z' })
  createdAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.fullName = user.fullName;
    dto.email = user.email;
    dto.isActive = user.isActive;
    dto.createdAt = user.createdAt;
    return dto;
  }
}
