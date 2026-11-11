import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import type { Diagram } from './diagram.entity';
import type { UmlNode } from './uml-node.entity';

@Entity('uml_connections')
export class UmlConnection {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id: string;

  @Column({ name: 'diagram_id', type: 'uuid' })
  diagramId: string;

  @Column({ name: 'source_node_id', type: 'varchar', length: 100 })
  sourceNodeId: string;

  @Column({ name: 'target_node_id', type: 'varchar', length: 100 })
  targetNodeId: string;

  @Column({ name: 'source_id', type: 'varchar', length: 120 })
  sourceId: string;

  @Column({ name: 'target_id', type: 'varchar', length: 120 })
  targetId: string;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({
    name: 'source_multiplicity',
    type: 'varchar',
    length: 20,
    default: '1',
  })
  sourceMultiplicity: string;

  @Column({
    name: 'target_multiplicity',
    type: 'varchar',
    length: 20,
    default: '0..*',
  })
  targetMultiplicity: string;

  /** Nombre de rol de cada extremo (se dibuja junto a su multiplicidad). */
  @Column({ name: 'source_role', type: 'varchar', length: 100, nullable: true })
  sourceRole: string | null;

  @Column({ name: 'target_role', type: 'varchar', length: 100, nullable: true })
  targetRole: string | null;

  /** Navegabilidad: unspecified, to_target, to_source o both. */
  @Column({ type: 'varchar', length: 20, default: 'unspecified' })
  navigability: string;

  @Column({
    name: 'assoc_anchor_node_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  assocAnchorNodeId: string | null;

  @ManyToOne('Diagram', (diagram: Diagram) => diagram.connections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'diagram_id' })
  diagram: Diagram;

  @ManyToOne('UmlNode', (node: UmlNode) => node.outgoingConnections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'source_node_id' })
  sourceNode: UmlNode;

  @ManyToOne('UmlNode', (node: UmlNode) => node.incomingConnections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'target_node_id' })
  targetNode: UmlNode;
}
