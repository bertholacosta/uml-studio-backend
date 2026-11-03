import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { ProjectMember } from '../entities/project-member.entity';
import { ProjectRole } from '../entities/project-role.enum';

@Injectable()
export class ProjectMemberRepository {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly repo: Repository<ProjectMember>,
  ) {}

  create(data: DeepPartial<ProjectMember>): ProjectMember {
    return this.repo.create(data);
  }

  async save(member: ProjectMember): Promise<ProjectMember> {
    return this.repo.save(member);
  }

  async findByProjectIdAndUserId(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null> {
    return this.repo.findOne({
      where: { projectId, userId },
      relations: {
        user: true,
      },
    });
  }

  async findRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const member = await this.repo.findOne({
      where: { projectId, userId },
      select: { role: true },
    });
    return member ? member.role : null;
  }

  async findByProjectId(projectId: string): Promise<ProjectMember[]> {
    return this.repo.find({
      where: { projectId },
      relations: {
        user: true,
      },
      order: { joinedAt: 'ASC' },
    });
  }

  async updateRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<void> {
    await this.repo.update({ projectId, userId }, { role });
  }

  async delete(projectId: string, userId: string): Promise<void> {
    await this.repo.delete({ projectId, userId });
  }
}
