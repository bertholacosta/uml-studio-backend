import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRepository } from '../repositories/user.repository';
import { User } from '../entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Partial<UserRepository>>;
  let jwtService: jest.Mocked<Partial<JwtService>>;

  const mockPassword = 'Password123!';
  const mockPasswordHash = bcrypt.hashSync(mockPassword, 10);

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    fullName: 'Test User',
    email: 'test@example.com',
    passwordHash: mockPasswordHash,
    isActive: true,
    createdAt: new Date(),
    projectsCreated: [],
    projectMemberships: [],
  };

  beforeEach(async () => {
    userRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      existsByEmail: jest.fn(),
      createAndSave: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mocked.jwt.token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('debe registrar un nuevo usuario exitosamente y retornar token JWT', async () => {
      userRepository.existsByEmail!.mockResolvedValue(false);
      userRepository.createAndSave!.mockResolvedValue(mockUser);

      const result = await service.register({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(userRepository.existsByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(userRepository.createAndSave).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken', 'mocked.jwt.token');
      expect(result.user).toHaveProperty('email', 'test@example.com');
    });

    it('debe lanzar ConflictException si el email ya existe', async () => {
      userRepository.existsByEmail!.mockResolvedValue(true);

      await expect(
        service.register({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('debe autenticar exitosamente con credenciales válidas', async () => {
      userRepository.findByEmail!.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@example.com',
        password: mockPassword,
      });

      expect(userRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
        true,
      );
      expect(result).toHaveProperty('accessToken', 'mocked.jwt.token');
      expect(result.user).toHaveProperty('id', mockUser.id);
    });

    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      userRepository.findByEmail!.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'notfound@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      userRepository.findByEmail!.mockResolvedValue(mockUser);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword999!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si la cuenta está inactiva', async () => {
      userRepository.findByEmail!.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: mockPassword,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('debe retornar el perfil de usuario si existe', async () => {
      userRepository.findById!.mockResolvedValue(mockUser);

      const result = await service.getProfile(mockUser.id);

      expect(userRepository.findById).toHaveBeenCalledWith(mockUser.id);
      expect(result).toHaveProperty('email', mockUser.email);
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      userRepository.findById!.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
