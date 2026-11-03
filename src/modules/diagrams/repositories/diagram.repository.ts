import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Diagram } from '../entities/diagram.entity';

@Injectable()
export class DiagramRepository {
  constructor(
    @InjectRepository(Diagram)
    private readonly repo: Repository<Diagram>,
  ) {}

  create(data: DeepPartial<Diagram>): Diagram {
    return this.repo.create(data);
  }

  async save(diagram: Diagram): Promise<Diagram> {
    return this.repo.save(diagram);
  }

  async findAllByProjectId(projectId: string): Promise<Diagram[]> {
    return this.repo.find({
      where: { projectId },
      order: { updatedAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Diagram | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        nodes: {
          attributes: true,
          methods: true,
        },
        connections: true,
      },
    });
  }

  async update(
    id: string,
    data: QueryDeepPartialEntity<Diagram>,
  ): Promise<void> {
    await this.repo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
