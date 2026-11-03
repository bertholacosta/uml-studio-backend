import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UmlConnection } from '../entities/uml-connection.entity';

@Injectable()
export class UmlConnectionRepository {
  constructor(
    @InjectRepository(UmlConnection)
    private readonly repo: Repository<UmlConnection>,
  ) {}

  create(data: DeepPartial<UmlConnection>): UmlConnection {
    return this.repo.create(data);
  }

  async save(conn: UmlConnection): Promise<UmlConnection>;
  async save(conns: UmlConnection[]): Promise<UmlConnection[]>;
  async save(
    conns: UmlConnection | UmlConnection[],
  ): Promise<UmlConnection | UmlConnection[]> {
    return this.repo.save(conns as any);
  }

  async findByDiagramId(diagramId: string): Promise<UmlConnection[]> {
    return this.repo.find({
      where: { diagramId },
    });
  }

  async deleteByDiagramId(diagramId: string): Promise<void> {
    await this.repo.delete({ diagramId });
  }
}
