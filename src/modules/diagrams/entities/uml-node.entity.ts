import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { Diagram } from './diagram.entity';
import type { UmlAttribute } from './uml-attribute.entity';
import type { UmlMethod } from './uml-method.entity';
import type { UmlConnection } from './uml-connection.entity';

@Entity('uml_nodes')
export class UmlNode {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'diagram_id', type: 'uuid' })
  diagramId: string;

  @Column({ type: 'varchar', length: 150, default: 'ClassName' })
  name: string;

  @Column({ name: 'position_x', type: 'float', default: 0 })
  positionX: number;

  @Column({ name: 'position_y', type: 'float', default: 0 })
  positionY: number;

  @Column({ type: 'int', default: 220 })
  width: number;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ name: 'is_anchor', type: 'boolean', default: false })
  isAnchor: boolean;

  @Column({
    name: 'assoc_main_conn_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  assocMainConnId: string | null;

  @ManyToOne('Diagram', (diagram: Diagram) => diagram.nodes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'diagram_id' })
  diagram: Diagram;

  @OneToMany('UmlAttribute', (attr: UmlAttribute) => attr.node, {
    cascade: true,
  })
  attributes: UmlAttribute[];

  @OneToMany('UmlMethod', (method: UmlMethod) => method.node, { cascade: true })
  methods: UmlMethod[];

  @OneToMany('UmlConnection', (conn: UmlConnection) => conn.sourceNode)
  outgoingConnections: UmlConnection[];

  @OneToMany('UmlConnection', (conn: UmlConnection) => conn.targetNode)
  incomingConnections: UmlConnection[];
}
