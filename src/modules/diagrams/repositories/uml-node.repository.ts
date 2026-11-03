import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, In } from 'typeorm';
import { UmlNode } from '../entities/uml-node.entity';

@Injectable()
export class UmlNodeRepository {
  constructor(
    @InjectRepository(UmlNode)
    private readonly repo: Repository<UmlNode>,
  ) {}

  create(data: DeepPartial<UmlNode>): UmlNode {
    return this.repo.create(data);
  }

  async save(node: UmlNode): Promise<UmlNode>;
  async save(nodes: UmlNode[]): Promise<UmlNode[]>;
  async save(nodes: UmlNode | UmlNode[]): Promise<UmlNode | UmlNode[]> {
    return this.repo.save(nodes as any);
  }

  async findById(id: string): Promise<UmlNode | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        attributes: true,
        methods: true,
      },
    });
  }

  async findByDiagramId(diagramId: string): Promise<UmlNode[]> {
    return this.repo.find({
      where: { diagramId },
      relations: {
        attributes: true,
        methods: true,
      },
    });
  }

  async deleteByDiagramId(diagramId: string): Promise<void> {
    await this.repo.delete({ diagramId });
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.repo.delete({ id: In(ids) });
  }
}
