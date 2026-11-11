import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DiagramRepository } from '../repositories/diagram.repository';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { CollaborationGateway } from '../../projects/gateways/collaboration.gateway';
import { ActivityService } from '../../activity/activity.service';
import { Diagram } from '../entities/diagram.entity';
import { UmlNode } from '../entities/uml-node.entity';
import { UmlAttribute } from '../entities/uml-attribute.entity';
import { UmlMethod } from '../entities/uml-method.entity';
import { UmlConnection } from '../entities/uml-connection.entity';
import { CreateDiagramDto } from '../dtos/create-diagram.dto';
import { UpdateDiagramDto } from '../dtos/update-diagram.dto';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';
import {
  DEFAULT_ATTRIBUTE_VISIBILITY,
  DEFAULT_METHOD_VISIBILITY,
  normalizeNavigability,
  normalizeRole,
  normalizeVisibility,
} from '../uml-notation';

/** Quién cambió un diagrama, para el aviso al resto del proyecto y el registro de actividad. */
export interface DiagramActor {
  userId: string;
  userName: string;
  /** Si el cambio lo hizo Trazo, a pedido de quién. */
  onBehalfOf?: { userId: string; userName: string };
}

/**
 * Como mucho un aviso diagram_activity por diagrama en este intervalo: el editor guarda solo
 * cada pocos segundos y la app móvil recarga la lista con cada aviso. El último cambio de la
 * ráfaga se avisa al cumplirse el intervalo.
 */
export const ANNOUNCE_INTERVAL_MS = 30_000;

interface DiagramActivityEvent {
  projectId: string;
  diagramId: string;
  diagramName: string;
  userId: string;
  userName: string;
  classCount: number;
  at: string;
}

@Injectable()
export class DiagramService implements OnModuleDestroy {
  /** Último aviso por diagrama y, si llegó otro antes de tiempo, el que queda pendiente. */
  private readonly announcements = new Map<
    string,
    { lastAt: number; pending?: DiagramActivityEvent; timer?: NodeJS.Timeout }
  >();

  constructor(
    private readonly diagramRepository: DiagramRepository,
    private readonly access: ProjectAccessService,
    private readonly dataSource: DataSource,
    private readonly collaborationGateway: CollaborationGateway,
    private readonly activity: ActivityService,
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
    const [diagrams, summaries] = await Promise.all([
      this.diagramRepository.findAllByProjectId(projectId),
      this.access.listProjectDiagrams(projectId),
    ]);
    // El listado no carga el contenido, solo los nombres de las clases (una consulta)
    const classNames = new Map(summaries.map((s) => [s.id, s.classNames]));
    return diagrams.map((d) => ({
      ...DiagramResponseDto.fromEntity(d),
      classNames: classNames.get(d.id) || [],
    }));
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
    actor?: DiagramActor,
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
        visibility: normalizeVisibility(
          a.visibility,
          DEFAULT_ATTRIBUTE_VISIBILITY,
        ),
        orderIndex: a.orderIndex ?? index,
      })),
    );
    const methodRows = nodes.flatMap((n) =>
      (n.methods || []).map((m, index) => ({
        nodeId: n.id,
        name: m.name,
        parameters: m.parameters || '',
        returnType: m.returnType,
        visibility: normalizeVisibility(
          m.visibility,
          DEFAULT_METHOD_VISIBILITY,
        ),
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
      sourceRole: normalizeRole(c.sourceRole) ?? null,
      targetRole: normalizeRole(c.targetRole) ?? null,
      navigability: normalizeNavigability(c.navigability),
      assocAnchorNodeId: c.assocAnchorNodeId || null,
    }));

    // El estado anterior hace falta para saber qué cambió quien guarda
    await this.activity.prime(id);

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

    const saved = DiagramResponseDto.fromEntity(await this.loadFull(id));
    const who = actor || {
      userId,
      userName: (await this.access.getUserName(userId)) || 'Alguien',
    };
    // Lo que ya llegó por el socket no se cuenta dos veces: solo queda lo que no pasó por él
    await this.activity.record(
      id,
      { userId: who.userId, userName: who.userName },
      nodes,
      astDto.connections || [],
      who.onBehalfOf,
    );
    this.announce(saved, who);
    return saved;
  }

  /**
   * Avisa al canal del proyecto de que un diagrama cambió (evento diagram_activity): la app
   * móvil refresca la lista y lo notifica a quien no está mirando ese diagrama.
   */
  private announce(diagram: DiagramResponseDto, who: DiagramActor): void {
    if (!diagram.projectId) return;
    const event: DiagramActivityEvent = {
      projectId: diagram.projectId,
      diagramId: diagram.id,
      diagramName: diagram.name,
      userId: who.userId,
      userName: who.userName,
      classCount: diagram.nodes.filter((n) => !n.isAnchor).length,
      at: new Date().toISOString(),
    };
    const now = Date.now();
    const state = this.announcements.get(diagram.id);
    if (!state || now - state.lastAt >= ANNOUNCE_INTERVAL_MS) {
      if (state?.timer) clearTimeout(state.timer);
      this.announcements.set(diagram.id, { lastAt: now });
      this.emitActivity(event);
      return;
    }
    state.pending = event;
    state.timer ??= setTimeout(
      () => {
        const pending = state.pending;
        this.announcements.set(diagram.id, { lastAt: Date.now() });
        if (pending) this.emitActivity(pending);
      },
      state.lastAt + ANNOUNCE_INTERVAL_MS - now,
    );
    state.timer.unref?.();
  }

  private emitActivity(event: DiagramActivityEvent): void {
    this.collaborationGateway.emitToProject(
      event.projectId,
      'diagram_activity',
      event,
    );
  }

  onModuleDestroy(): void {
    for (const { timer } of this.announcements.values()) {
      if (timer) clearTimeout(timer);
    }
    this.announcements.clear();
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
