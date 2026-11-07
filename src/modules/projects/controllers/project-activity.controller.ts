import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProjectAccessService } from '../services/project-access.service';
import {
  ActivityService,
  CanvasActivityDto,
} from '../../activity/activity.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

export class ActivityQueryDto {
  /** Solo lo posterior a esta fecha (ISO). */
  @IsOptional()
  @IsDateString()
  since?: string;

  /** Solo lo que hizo esta persona (o Trazo a pedido suyo). */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export interface ProjectActivityDto {
  entries: CanvasActivityDto[];
  /** Cuándo dejó el proyecto por última vez quien consulta. */
  lastSeenAt?: string;
}

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectActivityController {
  constructor(
    private readonly access: ProjectAccessService,
    private readonly activity: ActivityService,
  ) {}

  @Get(':id/activity')
  @ApiOperation({
    summary:
      'Quién cambió qué en los diagramas del proyecto (lo más reciente primero)',
  })
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ActivityQueryDto,
    @CurrentUser() user: User,
  ): Promise<ProjectActivityDto> {
    await this.access.assertProjectAccess(id, user.id, 'read');
    const since = query.since ? new Date(query.since) : undefined;
    const [entries, lastSeenAt] = await Promise.all([
      this.activity.recent(id, {
        since,
        userIds: query.userId ? [query.userId] : undefined,
        limit: query.limit || 30,
      }),
      this.activity.lastSeen(id, user.id),
    ]);
    return {
      entries: entries
        .map((e) => this.activity.toDto(e, since))
        .filter((e) => e.changeCount > 0),
      ...(lastSeenAt && { lastSeenAt: lastSeenAt.toISOString() }),
    };
  }
}
