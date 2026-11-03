import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UmlAttribute } from '../entities/uml-attribute.entity';

@Injectable()
export class UmlAttributeRepository {
  constructor(
    @InjectRepository(UmlAttribute)
    private readonly repo: Repository<UmlAttribute>,
  ) {}

  create(data: DeepPartial<UmlAttribute>): UmlAttribute {
    return this.repo.create(data);
  }

  async save(attr: UmlAttribute): Promise<UmlAttribute>;
  async save(attrs: UmlAttribute[]): Promise<UmlAttribute[]>;
  async save(
    attrs: UmlAttribute | UmlAttribute[],
  ): Promise<UmlAttribute | UmlAttribute[]> {
    return this.repo.save(attrs as any);
  }

  async findByNodeId(nodeId: string): Promise<UmlAttribute[]> {
    return this.repo.find({
      where: { nodeId },
      order: { orderIndex: 'ASC' },
    });
  }

  async deleteByNodeIds(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) return;
    await this.repo
      .createQueryBuilder()
      .delete()
      .from(UmlAttribute)
      .where('node_id IN (:...nodeIds)', { nodeIds })
      .execute();
  }

  async deleteByNodeId(nodeId: string): Promise<void> {
    await this.repo.delete({ nodeId });
  }
}
