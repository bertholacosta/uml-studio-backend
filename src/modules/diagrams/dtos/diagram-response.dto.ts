import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Diagram } from '../entities/diagram.entity';
import { UmlNodeDto, UmlConnectionDto } from './save-diagram-ast.dto';
import {
  DEFAULT_ATTRIBUTE_VISIBILITY,
  DEFAULT_METHOD_VISIBILITY,
} from '../uml-notation';

export class DiagramResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  projectId: string | null;

  @ApiProperty({ example: 'UML Class Diagram' })
  name: string;

  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ type: [UmlNodeDto] })
  nodes: UmlNodeDto[];

  @ApiProperty({ type: [UmlConnectionDto] })
  connections: UmlConnectionDto[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Cliente', 'Pedido'],
    description:
      'En el listado de un proyecto: nombres de sus clases (nodes y connections van vacíos)',
  })
  classNames?: string[];

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: '2026-08-28T14:00:00.000Z' })
  createdAt: Date;

  static fromEntity(diagram: Diagram): DiagramResponseDto {
    const dto = new DiagramResponseDto();
    dto.id = diagram.id;
    dto.projectId = diagram.projectId;
    dto.name = diagram.name;
    dto.version = diagram.version;
    dto.updatedAt = diagram.updatedAt;
    dto.createdAt = diagram.createdAt;

    dto.nodes = (diagram.nodes || []).map((node) => ({
      id: node.id,
      name: node.name,
      positionX: Number(node.positionX),
      positionY: Number(node.positionY),
      width: node.width,
      height: node.height,
      isAnchor: node.isAnchor,
      assocMainConnId: node.assocMainConnId,
      attributes: (node.attributes || [])
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((a) => ({
          name: a.name,
          type: a.type,
          visibility: a.visibility || DEFAULT_ATTRIBUTE_VISIBILITY,
          orderIndex: a.orderIndex,
        })),
      methods: (node.methods || [])
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((m) => ({
          name: m.name,
          parameters: m.parameters,
          returnType: m.returnType,
          visibility: m.visibility || DEFAULT_METHOD_VISIBILITY,
          orderIndex: m.orderIndex,
        })),
    }));

    dto.connections = (diagram.connections || []).map((conn) => ({
      id: conn.id,
      sourceNodeId: conn.sourceNodeId,
      targetNodeId: conn.targetNodeId,
      sourceId: conn.sourceId,
      targetId: conn.targetId,
      type: conn.type,
      name: conn.name,
      sourceMultiplicity: conn.sourceMultiplicity || '1',
      targetMultiplicity: conn.targetMultiplicity || '0..*',
      sourceRole: conn.sourceRole,
      targetRole: conn.targetRole,
      navigability: conn.navigability || 'unspecified',
      assocAnchorNodeId: conn.assocAnchorNodeId,
    }));

    return dto;
  }
}
