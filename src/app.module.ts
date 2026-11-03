import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import {
  AppThrottlerGuard,
  DEFAULT_LIMIT,
} from './common/guards/throttle.guard';
import { HealthController } from './health.controller';

import { AuthModule } from './modules/auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DiagramsModule } from './modules/diagrams/diagrams.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { CodeGeneratorModule } from './modules/code-generator/code-generator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [databaseConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get('database')!,
    }),
    // MongoDB (NoSQL) guarda la conversación con Trazo y su contexto
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27017/uml_studio_ai',
        serverSelectionTimeoutMS: 5000,
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ...DEFAULT_LIMIT }]),
    AuthModule,
    ProjectsModule,
    DiagramsModule,
    AiAssistantModule,
    CodeGeneratorModule,
  ],
  controllers: [HealthController],
  providers: [
    // Todas las rutas requieren JWT salvo las marcadas con @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Va después del JWT para limitar por usuario cuando hay sesión
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}
