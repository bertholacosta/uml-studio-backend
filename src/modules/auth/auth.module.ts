import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { AuthSeedService } from './services/auth-seed.service';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: (configService.get<string>('jwt.expiresIn') ||
            '7d') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSeedService, UserRepository, JwtStrategy],
  exports: [
    AuthService,
    AuthSeedService,
    UserRepository,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
