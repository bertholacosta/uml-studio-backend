import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { UmlNode } from './uml-node.entity';

@Entity('uml_methods')
export class UmlMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'node_id', type: 'varchar', length: 100 })
  nodeId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  parameters: string;

  @Column({
    name: 'return_type',
    type: 'varchar',
    length: 100,
    default: 'void',
  })
  returnType: string;

  /** Visibilidad UML: public (+), private (−), protected (#) o package (~). */
  @Column({ type: 'varchar', length: 10, default: 'public' })
  visibility: string;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @ManyToOne('UmlNode', (node: UmlNode) => node.methods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'node_id' })
  node: UmlNode;
}
