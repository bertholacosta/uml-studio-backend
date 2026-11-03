import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { XmiExporterService, DiagramAstData } from './xmi-exporter.service';
import { XmiParserService } from './xmi-parser.service';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { DiagramService } from '../../diagrams/services/diagram.service';
import { SaveDiagramAstDto } from '../../diagrams/dtos/save-diagram-ast.dto';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { ImportXmiDto } from '../dtos/xmi-interop.dto';

@Injectable()
export class XmiInteropService {
  constructor(
    private readonly exporterService: XmiExporterService,
    private readonly parserService: XmiParserService,
    private readonly diagramRepo: DiagramRepository,
    private readonly diagramService: DiagramService,
    private readonly access: ProjectAccessService,
  ) {}

  /**
   * Exporta un diagrama existente en la base de datos a formato XMI 2.1 estándar de Enterprise Architect.
   */
  async exportDiagramToXmi(
    diagramId: string,
    userId: string,
  ): Promise<{ filename: string; xmiContent: string }> {
    await this.access.assertDiagramAccess(diagramId, userId, 'read');
    const diagram = await this.diagramRepo.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException(
        `Diagrama con ID ${diagramId} no encontrado.`,
      );
    }

    const astData: DiagramAstData = {
      name: diagram.name,
      nodes: (diagram.nodes || []).map((n) => ({
        id: n.id,
        name: n.name,
        position: { x: Number(n.positionX), y: Number(n.positionY) },
        width: n.width || 220,
        height: n.height || 120,
        attributes: (n.attributes || []).map((a) => ({
          name: a.name,
          type: a.type,
          visibility: 'private',
          isPk:
            a.name.toLowerCase().endsWith('id') ||
            a.name.toLowerCase() === 'id',
          isNullable: false,
        })),
        methods: (n.methods || []).map((m) => ({
          name: m.name,
          returnType: m.returnType || 'void',
          parameters: m.parameters || '',
          visibility: 'public',
        })),
        isAnchor: n.isAnchor,
        assocMainConnId: n.assocMainConnId || undefined,
      })),
      connections: (diagram.connections || []).map((c) => ({
        id: c.id,
        sourceNodeId: c.sourceNodeId,
        targetNodeId: c.targetNodeId,
        sourceId: c.sourceId,
        targetId: c.targetId,
        type: c.type,
        name: c.name || undefined,
        sourceMultiplicity: c.sourceMultiplicity || '',
        targetMultiplicity: c.targetMultiplicity || '',
        assocAnchorNodeId: c.assocAnchorNodeId || undefined,
      })),
    };

    const xmiContent = this.exporterService.exportToXmi(astData);
    const filename = `${diagram.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_ea.xmi`;

    return { filename, xmiContent };
  }

  /**
   * Parsea un archivo XMI 2.1 e inserta/actualiza el diagrama en BD si se solicitó.
   */
  async importXmi(
    dto: ImportXmiDto,
    userId: string,
  ): Promise<DiagramAstData & { diagramId?: string }> {
    // Los ids del archivo se renuevan: los de nodos y conexiones son únicos en toda la base,
    // así que importar dos veces el mismo XMI (o reimportar uno exportado) chocaría
    const ast = withFreshIds(this.parserService.parseXmi(dto.xmiContent));

    // Si se solicitó actualizar un diagrama existente
    if (dto.diagramId) {
      await this.access.assertDiagramAccess(dto.diagramId, userId, 'write');

      await this.diagramService.saveAst(dto.diagramId, toSaveDto(ast), userId);
      // Se renombra solo si el contenido se guardó
      if (dto.diagramName || ast.name) {
        await this.diagramRepo.update(dto.diagramId, {
          name: dto.diagramName || ast.name,
        });
      }

      return { ...ast, diagramId: dto.diagramId };
    }

    // Si se solicitó crear un nuevo diagrama en un proyecto
    if (dto.projectId) {
      await this.access.assertProjectAccess(dto.projectId, userId, 'write');

      const createdEntity = this.diagramRepo.create({
        projectId: dto.projectId,
        name: dto.diagramName || ast.name || 'Diagrama Importado XMI',
        version: '1.0.0',
      });
      const created = await this.diagramRepo.save(createdEntity);

      try {
        await this.diagramService.saveAst(created.id, toSaveDto(ast), userId);
      } catch (err) {
        // No dejar un diagrama vacío si falló la importación
        await this.diagramRepo.delete(created.id);
        throw err;
      }

      return { ...ast, diagramId: created.id };
    }

    return ast;
  }
}

/** Convierte el AST leído del XMI al formato de guardado del diagrama. */
function toSaveDto(ast: DiagramAstData): SaveDiagramAstDto {
  return {
    nodes: ast.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      positionX: Number(n.position?.x ?? 50),
      positionY: Number(n.position?.y ?? 50),
      width: n.width || 220,
      height: n.height || 120,
      attributes: (n.attributes || []).map((a, i) => ({
        name: a.name,
        type: a.type,
        orderIndex: i,
      })),
      methods: (n.methods || []).map((m, i) => ({
        name: m.name,
        parameters: m.parameters || '',
        returnType: m.returnType || 'void',
        orderIndex: i,
      })),
      isAnchor: n.isAnchor || false,
      assocMainConnId: n.assocMainConnId || null,
    })),
    connections: ast.connections.map((c) => ({
      id: c.id,
      sourceNodeId: c.sourceNodeId,
      targetNodeId: c.targetNodeId,
      sourceId: c.sourceId || `${c.sourceNodeId}_right`,
      targetId: c.targetId || `${c.targetNodeId}_left`,
      type: c.type,
      name: c.name || null,
      sourceMultiplicity: c.sourceMultiplicity || '1',
      targetMultiplicity: c.targetMultiplicity || '0..*',
      assocAnchorNodeId: c.assocAnchorNodeId || null,
    })),
  };
}

/**
 * Asigna ids nuevos a nodos y conexiones y actualiza todas sus referencias
 * (extremos, puntos de anclaje «<nodo>_right», anclas y tablas intermedias).
 */
export function withFreshIds(ast: DiagramAstData): DiagramAstData {
  const suffix = () => randomUUID().replace(/-/g, '').slice(0, 12);
  const nodeIds = new Map(
    ast.nodes.map((n) => [
      n.id,
      `${n.isAnchor ? 'anchor' : 'node'}_${suffix()}`,
    ]),
  );
  const connIds = new Map(
    ast.connections.map((c) => [c.id, `conn_${suffix()}`]),
  );

  const node = (id?: string) => (id && nodeIds.get(id)) || id;
  const conn = (id?: string) => (id && connIds.get(id)) || id;
  // Los puntos de conexión son «<idNodo>» o «<idNodo>_<lado>»
  const handle = (id?: string) => {
    if (!id) return id;
    const match = id.match(/^(.*?)(_(?:top|bottom|left|right))?$/);
    const base = match?.[1] ?? id;
    return nodeIds.has(base) ? `${nodeIds.get(base)}${match?.[2] || ''}` : id;
  };

  return {
    ...ast,
    nodes: ast.nodes.map((n) => ({
      ...n,
      id: node(n.id)!,
      assocMainConnId: conn(n.assocMainConnId),
    })),
    connections: ast.connections.map((c) => ({
      ...c,
      id: conn(c.id)!,
      sourceNodeId: node(c.sourceNodeId)!,
      targetNodeId: node(c.targetNodeId)!,
      sourceId: handle(c.sourceId)!,
      targetId: handle(c.targetId)!,
      assocAnchorNodeId: node(c.assocAnchorNodeId),
    })),
  };
}
