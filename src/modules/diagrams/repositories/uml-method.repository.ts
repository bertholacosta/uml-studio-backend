import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UmlMethod } from '../entities/uml-method.entity';

@Injectable()
export class UmlMethodRepository {
  constructor(
    @InjectRepository(UmlMethod)
    private readonly repo: Repository<UmlMethod>,
  ) {}

  create(data: DeepPartial<UmlMethod>): UmlMethod {
    return this.repo.create(data);
  }

  async save(method: UmlMethod): Promise<UmlMethod>;
  async save(methods: UmlMethod[]): Promise<UmlMethod[]>;
  async save(
    methods: UmlMethod | UmlMethod[],
  ): Promise<UmlMethod | UmlMethod[]> {
    return this.repo.save(methods as any);
  }

  async findByNodeId(nodeId: string): Promise<UmlMethod[]> {
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
      .from(UmlMethod)
      .where('node_id IN (:...nodeIds)', { nodeIds })
      .execute();
  }

  async deleteByNodeId(nodeId: string): Promise<void> {
    await this.repo.delete({ nodeId });
  }
}
