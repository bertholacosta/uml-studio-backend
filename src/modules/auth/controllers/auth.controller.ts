import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { User } from '../entities/user.entity';
import { AUTH_LIMIT } from '../../../common/guards/throttle.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: AUTH_LIMIT })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico ya está registrado',
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: AUTH_LIMIT })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión y obtener token JWT' })
  @ApiResponse({
    status: 200,
    description: 'Inicio de sesión exitoso',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener datos del usuario autenticado actual' })
  @ApiResponse({
    status: 200,
    description: 'Perfil de usuario',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async getProfile(@CurrentUser() user: User): Promise<UserResponseDto> {
    return this.authService.getProfile(user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualizar datos del perfil del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado exitosamente',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.authService.updateProfile(user.id, dto);
  }
}
