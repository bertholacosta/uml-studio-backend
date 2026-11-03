import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { getAllowedCorsOrigins, isOriginAllowed } from './config/cors.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Las fotos de diagramas viajan en Base64 dentro del JSON
  app.useBodyParser('json', { limit: process.env.BODY_LIMIT || '15mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });

  // Detrás de un balanceador (ALB, Nginx, Render...) para obtener la IP y el protocolo reales
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  const allowedOrigins = getAllowedCorsOrigins();
  logger.log(`Orígenes CORS habilitados: ${allowedOrigins.join(', ')}`);
  app.enableCors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origen CORS no permitido: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger se publica fuera de producción, o en producción con SWAGGER_ENABLED=true
  if (!isProduction || process.env.SWAGGER_ENABLED === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('UML Studio API')
      .setDescription(
        'Diagramas UML colaborativos, asistente Trazo, interoperabilidad XMI y generación de código Spring Boot y Flutter',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Servidor escuchando en el puerto ${port} (prefijo /api)`);
}
bootstrap();
