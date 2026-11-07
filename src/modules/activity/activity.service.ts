import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DataSource } from 'typeorm';
import { Model } from 'mongoose';
import { Diagram } from '../diagrams/entities/diagram.entity';
import {
  ActivityActor,
  CanvasActivity,
  CanvasActivityDocument,
  ProjectPresence,
} from './canvas-activity.schema';
import {
  DiffConnection,
  DiffNode,
  FactMap,
  changesSince,
  describeChanges,
  diffFacts,
  factsOf,
  mergeChanges,
} from './canvas-diff';

/** Cambios seguidos de la misma persona en el mismo diagrama se suman en una entrada. */
const MERGE_WINDOW_MS = 15 * 60_000;
/** Un diagrama sin cambios en este tiempo deja de tener su estado en memoria. */
const BASELINE_IDLE_MS = 2 * 60 * 60_000;

/** Último estado conocido de un diagrama: con él se calcula qué cambió cada edición. */
interface Baseline {
  projectId: string;
  diagramName: string;
  facts: FactMap;
  usedAt: number;
}

export interface ActivityQuery {
  since?: Date;
  /** Solo lo que hicieron estas personas (o Trazo a pedido de ellas). */
  userIds?: string[];
  diagramId?: string;
  limit?: number;
}

export interface CanvasActivityDto {
  id: string;
  projectId: string;
  diagramId: string;
  diagramName: string;
  actor: ActivityActor;
  onBehalfOf?: ActivityActor;
  summary: string;
  changeCount: number;
  startedAt: string;
  updatedAt: string;
}

/**
 * Registro de autoría de los lienzos: quién cambió qué, en MongoDB. Cada edición que llega por
 * el socket (o cada guardado, si no pasó por él) se compara con el último estado del diagrama y
 * la diferencia se atribuye a quien la hizo, así lo que Ana guarda no se apunta a su nombre si
 * lo hizo Luis. También recuerda cuándo se conectó cada persona por última vez.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private readonly baselines = new Map<string, Baseline>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    @InjectModel(CanvasActivity.name)
    private readonly activity: Model<CanvasActivity>,
    @InjectModel(ProjectPresence.name)
    private readonly presence: Model<ProjectPresence>,
    private readonly dataSource: DataSource,
  ) {}

  /** Carga el estado guardado del diagrama antes de sobrescribirlo, si aún no lo conoce. */
  prime(diagramId: string): Promise<void> {
    return this.inOrder(diagramId, async () => {
      await this.baseline(diagramId);
    }).catch((err) => this.warn('No se pudo cargar el diagrama', err));
  }

  /**
   * Atribuye a una persona lo que cambió en el diagrama desde el último estado conocido.
   * Nunca lanza: un fallo de MongoDB no debe cortar la colaboración.
   */
  record(
    diagramId: string,
    actor: ActivityActor,
    nodes: DiffNode[],
    connections: DiffConnection[],
    onBehalfOf?: ActivityActor,
  ): Promise<CanvasActivityDocument | null> {
    return this.inOrder(diagramId, () =>
      this.apply(diagramId, actor, nodes, connections, onBehalfOf),
    ).catch((err) => {
      this.warn('No se pudo registrar la actividad', err);
      return null;
    });
  }

  /** Actividad de un proyecto, lo más reciente primero. */
  async recent(
    projectId: string,
    query: ActivityQuery = {},
  ): Promise<CanvasActivityDocument[]> {
    const filter: Record<string, unknown> = { projectId };
    if (query.since) filter.updatedAt = { $gt: query.since };
    if (query.diagramId) filter.diagramId = query.diagramId;
    if (query.userIds?.length) {
      filter.$or = [
        { 'actor.userId': { $in: query.userIds } },
        { 'onBehalfOf.userId': { $in: query.userIds } },
      ];
    }
    return this.activity
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(Math.min(query.limit || 20, 100))
      .exec();
  }

  /** Guarda que la persona estuvo conectada al proyecto hasta ahora. */
  async markSeen(
    projectId: string,
    userId: string,
    at = new Date(),
  ): Promise<void> {
    try {
      await this.presence.updateOne(
        { projectId, userId },
        { $set: { lastSeenAt: at } },
        { upsert: true },
      );
    } catch (err) {
      this.warn('No se pudo guardar la última conexión', err);
    }
  }

  /** Cuándo dejó el proyecto por última vez (undefined si nunca se registró). */
  async lastSeen(projectId: string, userId: string): Promise<Date | undefined> {
    const row = await this.presence
      .findOne({ projectId, userId })
      .lean()
      .exec();
    return row?.lastSeenAt;
  }

  /** Resumen de la entrada; con fecha, solo de lo que cambió después (vacío si nada). */
  summarySince(entry: CanvasActivityDocument, since?: Date): string {
    return since
      ? describeChanges(
          changesSince(entry.changes, since, entry.createdAt.getTime()),
        )
      : entry.summary;
  }

  toDto(entry: CanvasActivityDocument, since?: Date): CanvasActivityDto {
    const changes = since
      ? changesSince(entry.changes, since, entry.createdAt.getTime())
      : entry.changes;
    return {
      id: entry.id,
      projectId: entry.projectId,
      diagramId: entry.diagramId,
      diagramName: entry.diagramName,
      actor: { userId: entry.actor.userId, userName: entry.actor.userName },
      ...(entry.onBehalfOf?.userId && {
        onBehalfOf: {
          userId: entry.onBehalfOf.userId,
          userName: entry.onBehalfOf.userName,
        },
      }),
      summary: this.summarySince(entry, since),
      changeCount: changes.length,
      startedAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  // --- Internos ---

  private async apply(
    diagramId: string,
    actor: ActivityActor,
    nodes: DiffNode[],
    connections: DiffConnection[],
    onBehalfOf?: ActivityActor,
  ): Promise<CanvasActivityDocument | null> {
    const base = await this.baseline(diagramId);
    if (!base) return null;
    const next = factsOf(nodes, connections);
    const at = Date.now();
    const delta = diffFacts(base.facts, next).map((c) => ({ ...c, at }));
    base.facts = next;
    base.usedAt = Date.now();
    this.evictIdle();
    if (!delta.length) return null;

    const last = await this.activity
      .findOne({
        diagramId,
        'actor.userId': actor.userId,
        'onBehalfOf.userId': onBehalfOf?.userId ?? { $exists: false },
        updatedAt: { $gte: new Date(Date.now() - MERGE_WINDOW_MS) },
      })
      .sort({ updatedAt: -1 })
      .exec();

    if (last) {
      const changes = mergeChanges(last.changes, delta);
      // Lo deshizo todo: no queda nada que contar
      if (!changes.length) {
        await last.deleteOne();
        return null;
      }
      last.changes = changes;
      last.summary = describeChanges(changes);
      last.diagramName = base.diagramName;
      last.actor = actor;
      last.markModified('changes');
      return last.save();
    }

    return this.activity.create({
      projectId: base.projectId,
      diagramId,
      diagramName: base.diagramName,
      actor,
      ...(onBehalfOf && { onBehalfOf }),
      changes: delta,
      summary: describeChanges(delta),
    });
  }

  private async baseline(diagramId: string): Promise<Baseline | undefined> {
    const cached = this.baselines.get(diagramId);
    if (cached) return cached;

    const diagram = await this.dataSource.getRepository(Diagram).findOne({
      where: { id: diagramId },
      relations: {
        nodes: { attributes: true, methods: true },
        connections: true,
      },
    });
    if (!diagram?.projectId) return undefined;
    const base: Baseline = {
      projectId: diagram.projectId,
      diagramName: diagram.name,
      facts: factsOf(
        (diagram.nodes || []).map((n) => ({
          ...n,
          attributes: [...(n.attributes || [])].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          ),
          methods: [...(n.methods || [])].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          ),
        })),
        diagram.connections || [],
      ),
      usedAt: Date.now(),
    };
    this.baselines.set(diagramId, base);
    return base;
  }

  private evictIdle(): void {
    const limit = Date.now() - BASELINE_IDLE_MS;
    for (const [id, base] of this.baselines) {
      if (base.usedAt < limit) this.baselines.delete(id);
    }
  }

  /** Los cambios de un mismo diagrama se procesan en orden de llegada. */
  private inOrder<T>(diagramId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(diagramId) || Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.catch(() => undefined);
    this.queues.set(diagramId, tail);
    void tail.then(() => {
      if (this.queues.get(diagramId) === tail) this.queues.delete(diagramId);
    });
    return run;
  }

  private warn(what: string, err: unknown): void {
    this.logger.warn(`${what}: ${(err as Error)?.message || err}`);
  }
}
