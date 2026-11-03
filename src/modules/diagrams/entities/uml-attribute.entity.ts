import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { UmlNode } from './uml-node.entity';

@Entity('uml_attributes')
export class UmlAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'node_id', type: 'varchar', length: 100 })
  nodeId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 100, default: 'String' })
  type: string;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @ManyToOne('UmlNode', (node: UmlNode) => node.attributes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'node_id' })
  node: UmlNode;
}
