import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Requiere una base de datos PostgreSQL accesible con las variables del .env
describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health responde sin autenticación', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  it('las rutas protegidas exigen JWT', () => {
    return request(app.getHttpServer()).get('/projects').expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
