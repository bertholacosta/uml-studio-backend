import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DiagramRepository } from '../repositories/diagram.repository';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { Diagram } from '../entities/diagram.entity';
import { UmlNode } from '../entities/uml-node.entity';
import { UmlAttribute } from '../entities/uml-attribute.entity';
import { UmlMethod } from '../entities/uml-method.entity';
import { UmlConnection } from '../entities/uml-connection.entity';
import { CreateDiagramDto } from '../dtos/create-diagram.dto';
import { UpdateDiagramDto } from '../dtos/update-diagram.dto';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';

@Injectable()
export class DiagramService {
  constructor(
    private readonly diagramRepository: DiagramRepository,
    private readonly access: ProjectAccessService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateDiagramDto,
    userId: string,
  ): Promise<DiagramResponseDto> {
    await this.access.assertProjectAccess(dto.projectId, userId, 'write');

    const saved = await this.diagramRepository.save(
      this.diagramRepository.create({
        projectId: dto.projectId,
        name: dto.name.trim(),
        version: dto.version || '1.0.0',
      }),
    );
    return DiagramResponseDto.fromEntity({
      ...saved,
      nodes: [],
      connections: [],
    } as Diagram);
  }

  async findAllByProjectId(
    projectId: string,
    userId: string,
  ): Promise<DiagramResponseDto[]> {
    await this.access.assertProjectAccess(projectId, userId, 'read');
    const diagrams = await this.diagramRepository.findAllByProjectId(projectId);
    return diagrams.map((d) => DiagramResponseDto.fromEntity(d));
  }

  async findOne(id: string, userId: string): Promise<DiagramResponseDto> {
    await this.access.assertDiagramAccess(id, userId, 'read');
    return DiagramResponseDto.fromEntity(await this.loadFull(id));
  }

  async update(
    id: string,
    dto: UpdateDiagramDto,
    userId: string,
  ): Promise<DiagramResponseDto> {
    await this.access.assertDiagramAccess(id, userId, 'write');

    await this.diagramRepository.update(id, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.version && { version: dto.version }),
    });
    return DiagramResponseDto.fromEntity(await this.loadFull(id));
  }

  /**
   * Reemplaza el AST completo del diagrama en una transacción con inserciones en bloque:
   * unas pocas consultas sin importar cuántas clases tenga el diagrama.
   */
  async saveAst(
    id: string,
    astDto: SaveDiagramAstDto,
    userId: string,
  ): Promise<DiagramResponseDto> {
    await this.access.assertDiagramAccess(id, userId, 'write');

    const nodes = astDto.nodes || [];
    const nodeRows = nodes.map((n) => ({
      id: n.id,
      diagramId: id,
      name: n.name !== undefined ? n.name : n.isAnchor ? '' : 'ClassName',
      positionX: n.positionX,
      positionY: n.positionY,
      width: n.width !== undefined ? n.width : n.isAnchor ? 0 : 220,
      height: n.height || null,
      isAnchor: n.isAnchor || false,
      assocMainConnId: n.assocMainConnId || null,
    }));
    const attributeRows = nodes.flatMap((n) =>
      (n.attributes || []).map((a, index) => ({
        nodeId: n.id,
        name: a.name,
        type: a.type,
        orderIndex: a.orderIndex ?? index,
      })),
    );
    const methodRows = nodes.flatMap((n) =>
      (n.methods || []).map((m, index) => ({
        nodeId: n.id,
        name: m.name,
        parameters: m.parameters || '',
        returnType: m.returnType,
        orderIndex: m.orderIndex ?? index,
      })),
    );
    const connectionRows = (astDto.connections || []).map((c) => ({
      id: c.id,
      diagramId: id,
      sourceNodeId: c.sourceNodeId,
      targetNodeId: c.targetNodeId,
      sourceId: c.sourceId,
      targetId: c.targetId,
      type: c.type,
      name: c.name || null,
      sourceMultiplicity: c.sourceMultiplicity || '1',
      targetMultiplicity: c.targetMultiplicity || '0..*',
      assocAnchorNodeId: c.assocAnchorNodeId || null,
    }));

    await this.dataSource.transaction(async (manager) => {
      // Atributos, métodos y conexiones se borran en cascada con los nodos
      await manager.delete(UmlConnection, { diagramId: id });
      await manager.delete(UmlNode, { diagramId: id });

      if (nodeRows.length) await manager.insert(UmlNode, nodeRows);
      if (attributeRows.length)
        await manager.insert(UmlAttribute, attributeRows);
      if (methodRows.length) await manager.insert(UmlMethod, methodRows);
      if (connectionRows.length)
        await manager.insert(UmlConnection, connectionRows);

      await manager.update(Diagram, id, { updatedAt: new Date() });
    });

    return DiagramResponseDto.fromEntity(await this.loadFull(id));
  }

  async remove(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.access.assertDiagramAccess(id, userId, 'write');
    await this.diagramRepository.delete(id);
    return { success: true, message: 'Diagrama eliminado exitosamente' };
  }

  private async loadFull(id: string): Promise<Diagram> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }
    return diagram;
  }
}
