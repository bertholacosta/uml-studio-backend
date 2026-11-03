import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { User } from '../entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;

  const mockUserResponse: UserResponseDto = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    fullName: 'Test User',
    email: 'test@example.com',
    isActive: true,
    createdAt: new Date(),
  };

  const mockAuthResponse: AuthResponseDto = {
    accessToken: 'mocked.jwt.token',
    user: mockUserResponse,
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue(mockAuthResponse),
      login: jest.fn().mockResolvedValue(mockAuthResponse),
      getProfile: jest.fn().mockResolvedValue(mockUserResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('debe llamar a authService.register y retornar AuthResponseDto', async () => {
      const dto = {
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Password123!',
      };

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('login', () => {
    it('debe llamar a authService.login y retornar AuthResponseDto', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('getProfile', () => {
    it('debe llamar a authService.getProfile con el id del usuario', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' } as User;

      const result = await controller.getProfile(mockUser);

      expect(authService.getProfile).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('updateProfile', () => {
    it('debe llamar a authService.updateProfile con id y dto', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' } as User;
      const dto = { fullName: 'Usuario Actualizado' };
      authService.updateProfile = jest.fn().mockResolvedValue({
        ...mockUserResponse,
        fullName: 'Usuario Actualizado',
      });

      const result = await controller.updateProfile(mockUser, dto);

      expect(authService.updateProfile).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result.fullName).toEqual('Usuario Actualizado');
    });
  });
});
