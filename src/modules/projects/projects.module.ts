import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectRepository } from './repositories/project.repository';
import { ProjectMemberRepository } from './repositories/project-member.repository';
import { ProjectService } from './services/project.service';
import { ProjectMemberService } from './services/project-member.service';
import { ProjectAccessService } from './services/project-access.service';
import { CollaborationGateway } from './gateways/collaboration.gateway';
import { ProjectController } from './controllers/project.controller';
import { ProjectMemberController } from './controllers/project-member.controller';
import { AuthModule } from '../auth/auth.module';
import { DiagramsModule } from '../diagrams/diagrams.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember]),
    forwardRef(() => DiagramsModule),
    AuthModule,
  ],
  controllers: [ProjectController, ProjectMemberController],
  providers: [
    ProjectService,
    ProjectMemberService,
    ProjectAccessService,
    ProjectRepository,
    ProjectMemberRepository,
    CollaborationGateway,
  ],
  exports: [
    ProjectRepository,
    ProjectMemberRepository,
    ProjectAccessService,
    CollaborationGateway,
  ],
})
export class ProjectsModule {}
