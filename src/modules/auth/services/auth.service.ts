import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userRepository.existsByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException(
        'Ya existe una cuenta registrada con este correo electrónico',
      );
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const newUser = await this.userRepository.createAndSave({
      fullName: dto.fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      isActive: true,
    });

    const accessToken = this.generateToken(newUser);

    return {
      accessToken,
      user: UserResponseDto.fromEntity(newUser),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail, true);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('La cuenta de usuario está desactivada');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: UserResponseDto.fromEntity(user),
    };
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return UserResponseDto.fromEntity(user);
  }

  async updateProfile(
    userId: string,
    dto: { fullName?: string; password?: string },
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updates: Partial<User> = {};

    if (dto.fullName && dto.fullName.trim().length > 0) {
      updates.fullName = dto.fullName.trim();
    }

    if (dto.password && dto.password.trim().length >= 6) {
      const saltRounds = 10;
      updates.passwordHash = await bcrypt.hash(dto.password.trim(), saltRounds);
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepository.update(userId, updates);
    }

    const updatedUser = await this.userRepository.findById(userId);
    return UserResponseDto.fromEntity(updatedUser || user);
  }

  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
    };
    return this.jwtService.sign(payload);
  }
}
