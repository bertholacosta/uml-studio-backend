import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators/public.decorator';

/** Comprobación de salud para el balanceador o el orquestador de contenedores. */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongo: Connection,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Estado del servidor y de las bases de datos (PostgreSQL y MongoDB)',
  })
  async check(): Promise<{ status: 'ok'; uptime: number }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
    try {
      await this.mongo.db!.admin().ping();
    } catch {
      throw new ServiceUnavailableException('MongoDB no disponible');
    }
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
