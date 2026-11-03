import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Project } from '../entities/project.entity';

@Injectable()
export class ProjectRepository {
  constructor(
    @InjectRepository(Project)
    private readonly repo: Repository<Project>,
  ) {}

  create(data: DeepPartial<Project>): Project {
    return this.repo.create(data);
  }

  async save(project: Project): Promise<Project> {
    return this.repo.save(project);
  }

  async findAllForUser(userId: string): Promise<Project[]> {
    return this.repo
      .createQueryBuilder('project')
      .innerJoin(
        'project.members',
        'membership',
        'membership.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect('project.creator', 'creator')
      .leftJoinAndSelect('project.members', 'allMembers')
      .leftJoinAndSelect('allMembers.user', 'memberUser')
      .leftJoinAndSelect('project.diagrams', 'diagrams')
      .orderBy('project.createdAt', 'DESC')
      .getMany();
  }

  async findById(id: string): Promise<Project | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        creator: true,
        members: {
          user: true,
        },
        diagrams: true,
      },
    });
  }

  async update(
    id: string,
    data: QueryDeepPartialEntity<Project>,
  ): Promise<void> {
    await this.repo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
