import { ApiProperty } from '@nestjs/swagger';
import { UmlClassNode, UmlConnection } from '../domain/uml-diagram.types';

/** Cómo quedaría el diagrama si se aplicara una propuesta de Trazo (no se guarda). */
export class ProposalPreviewDto {
  @ApiProperty()
  messageId: string;

  @ApiProperty()
  diagramId: string;

  @ApiProperty({ example: 'Clase Pago (id, monto)' })
  changesSummary: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  nodes: UmlClassNode[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  connections: UmlConnection[];

  @ApiProperty({
    type: [String],
    description: 'Operaciones que no se podrían aplicar al diagrama actual',
  })
  skipped: string[];
}
