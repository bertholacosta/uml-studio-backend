import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { ProjectAccessService } from '../services/project-access.service';
import { UserRepository } from '../../auth/repositories/user.repository';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { isOriginAllowed } from '../../../config/cors.config';

interface ClientMetadata {
  userId: string;
  userName: string;
  diagramId: string;
  color: string;
  canEdit: boolean;
}

interface AuthenticatedUser {
  id: string;
  fullName: string;
}

export interface Participant {
  userId: string;
  userName: string;
  color: string;
  isConnected: boolean;
}

/** Último diagrama conocido de una sala y cuándo se recibió. */
export interface DiagramSnapshot {
  nodes: any[];
  connections: any[];
  at: number;
}

export interface NodeLockInfo {
  nodeId: string;
  userId: string;
  userName: string;
  color: string;
}

export const AI_USER_ID = 'ai_assistant';
export const AI_USER_NAME = 'Trazo';
const AI_COLOR = '#8B5CF6';
const DEFAULT_COLOR = '#007ACC';

/** Sala de Socket.IO de un diagrama: todos los que lo editan comparten esta sala. */
const roomOf = (diagramId: string) => `diagram_${diagramId}`;

@WebSocketGateway({
  namespace: '/collaboration',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origen CORS no permitido: ${origin}`), false);
    },
    credentials: true,
  },
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private readonly clientMap = new Map<string, ClientMetadata>();
  // Bloqueos de nodos por diagrama: diagramId => (nodeId => NodeLockInfo)
  private readonly nodeLocks = new Map<string, Map<string, NodeLockInfo>>();
  // Último estado del diagrama que circuló por la sala: lo usa Trazo si cambió mientras pensaba
  private readonly snapshots = new Map<string, DiagramSnapshot>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly access: ProjectAccessService,
  ) {}

  handleConnection(client: Socket): void {
    // Se guarda la promesa para que join_room espere la verificación del token
    client.data.authPromise = this.authenticate(client);
  }

  private async authenticate(
    client: Socket,
  ): Promise<AuthenticatedUser | null> {
    const authHeader = client.handshake.headers?.authorization;
    const token: string | undefined =
      client.handshake.auth?.token ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

    try {
      if (!token) {
        throw new Error('token ausente');
      }
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.userRepository.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new Error('usuario inexistente o inactivo');
      }
      return { id: user.id, fullName: user.fullName };
    } catch (err: any) {
      this.logger.warn(
        `Conexión rechazada ${client.id}: ${err?.message || err}`,
      );
      client.emit('unauthorized', { message: 'Token inválido o ausente' });
      client.disconnect(true);
      return null;
    }
  }

  handleDisconnect(client: Socket): void {
    this.leave(client);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: { diagramId: string; color?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<{
    success: boolean;
    participants: Participant[];
    activeLocks: NodeLockInfo[];
  }> {
    const failure = { success: false, participants: [], activeLocks: [] };
    try {
      const user: AuthenticatedUser | null = await client.data.authPromise;
      if (!user || !isUUID(data?.diagramId)) {
        return failure;
      }

      // Lanza excepción si el usuario no es miembro del proyecto del diagrama
      const accessLevel = await this.access.getDiagramAccessLevel(
        data.diagramId,
        user.id,
      );

      // Si el socket ya estaba en otro diagrama, salir de él antes de unirse al nuevo
      this.leave(client);

      const room = roomOf(data.diagramId);
      await client.join(room);

      const color = data.color || DEFAULT_COLOR;
      this.clientMap.set(client.id, {
        userId: user.id,
        userName: user.fullName,
        diagramId: data.diagramId,
        color,
        canEdit: accessLevel === 'write',
      });

      const participants = this.participantsOf(data.diagramId);
      this.server.to(room).emit('room_participants_updated', {
        diagramId: data.diagramId,
        participants,
      });
      client.to(room).emit('user_joined', {
        userId: user.id,
        userName: user.fullName,
        color,
        socketId: client.id,
      });

      return {
        success: true,
        participants,
        activeLocks: Array.from(this.locksOf(data.diagramId).values()),
      };
    } catch (err) {
      this.logger.error(`Error en join_room: ${err}`);
      return failure;
    }
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(@ConnectedSocket() client: Socket): { success: boolean } {
    this.leave(client);
    return { success: true };
  }

  @SubscribeMessage('lock_node')
  handleLockNode(
    @MessageBody() data: { nodeId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const meta = this.clientMap.get(client.id);
    if (!meta?.canEdit || !data?.nodeId) return;

    const locks = this.locksOf(meta.diagramId);
    const existing = locks.get(data.nodeId);
    if (existing && existing.userId !== meta.userId) {
      client.emit('node_lock_rejected', {
        nodeId: data.nodeId,
        lockedBy: existing,
      });
      return;
    }

    const lock: NodeLockInfo = {
      nodeId: data.nodeId,
      userId: meta.userId,
      userName: meta.userName,
      color: meta.color,
    };
    locks.set(data.nodeId, lock);
    client.to(roomOf(meta.diagramId)).emit('node_locked', lock);
  }

  @SubscribeMessage('unlock_node')
  handleUnlockNode(
    @MessageBody() data: { nodeId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const meta = this.clientMap.get(client.id);
    if (!meta || !data?.nodeId) return;

    // Solo quien tiene el bloqueo puede liberarlo
    const locks = this.locksOf(meta.diagramId);
    if (locks.get(data.nodeId)?.userId !== meta.userId) return;
    locks.delete(data.nodeId);

    this.server
      .to(roomOf(meta.diagramId))
      .emit('node_unlocked', { nodeId: data.nodeId, userId: meta.userId });
  }

  @SubscribeMessage('cursor_move')
  handleCursorMove(
    @MessageBody() data: { x: number; y: number },
    @ConnectedSocket() client: Socket,
  ): void {
    const meta = this.clientMap.get(client.id);
    if (!meta || typeof data?.x !== 'number' || typeof data?.y !== 'number')
      return;

    client.to(roomOf(meta.diagramId)).emit('cursor_moved', {
      userId: meta.userId,
      userName: meta.userName,
      x: data.x,
      y: data.y,
      color: meta.color,
    });
  }

  @SubscribeMessage('node_drag')
  handleNodeDrag(
    @MessageBody() data: { nodeId: string; position: { x: number; y: number } },
    @ConnectedSocket() client: Socket,
  ): void {
    const meta = this.clientMap.get(client.id);
    if (!meta?.canEdit || !data?.nodeId) return;

    client.to(roomOf(meta.diagramId)).emit('node_dragged', {
      nodeId: data.nodeId,
      position: data.position,
      userId: meta.userId,
    });
  }

  @SubscribeMessage('diagram_sync')
  handleDiagramSync(
    @MessageBody() data: { nodes: any[]; connections: any[]; action?: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const meta = this.clientMap.get(client.id);
    if (
      !meta?.canEdit ||
      !Array.isArray(data?.nodes) ||
      !Array.isArray(data?.connections)
    )
      return;

    this.snapshots.set(meta.diagramId, {
      nodes: data.nodes,
      connections: data.connections,
      at: Date.now(),
    });
    client.to(roomOf(meta.diagramId)).emit('diagram_synced', {
      nodes: data.nodes,
      connections: data.connections,
      userId: meta.userId,
      action: data.action || 'update',
    });
  }

  // --- API para el asistente Trazo ---

  /** Bloquea nodos mientras Trazo los modifica, para que nadie los edite a la vez. */
  lockNodesForAi(diagramId: string, nodeIds: string[]): void {
    if (!this.server) return;
    const locks = this.locksOf(diagramId);
    for (const nodeId of nodeIds) {
      const lock: NodeLockInfo = {
        nodeId,
        userId: AI_USER_ID,
        userName: AI_USER_NAME,
        color: AI_COLOR,
      };
      locks.set(nodeId, lock);
      this.server.to(roomOf(diagramId)).emit('node_locked', lock);
    }
  }

  unlockNodesForAi(diagramId: string, nodeIds: string[]): void {
    if (!this.server) return;
    const locks = this.locksOf(diagramId);
    for (const nodeId of nodeIds) {
      if (locks.get(nodeId)?.userId !== AI_USER_ID) continue;
      locks.delete(nodeId);
      this.server
        .to(roomOf(diagramId))
        .emit('node_unlocked', { nodeId, userId: AI_USER_ID });
    }
  }

  /** Envía a todos los colaboradores del diagrama el resultado de una mutación de Trazo. */
  broadcastAiMutation(
    diagramId: string,
    nodes: unknown[],
    connections: unknown[],
  ): void {
    this.snapshots.set(diagramId, { nodes, connections, at: Date.now() });
    if (!this.server) return;
    this.server.to(roomOf(diagramId)).emit('diagram_synced', {
      nodes,
      connections,
      userId: AI_USER_ID,
      userName: AI_USER_NAME,
      action: 'ai_mutation',
    });
  }

  /** Último diagrama que circuló por la sala (edición de un colaborador o de Trazo). */
  latestSnapshot(diagramId: string): DiagramSnapshot | undefined {
    return this.snapshots.get(diagramId);
  }

  /** Quién está ahora en la pizarra y si puede editar, para que Trazo lo sepa. */
  connectedUsers(diagramId: string): { userName: string; canEdit: boolean }[] {
    const byUser = new Map<string, { userName: string; canEdit: boolean }>();
    for (const c of this.clientMap.values()) {
      if (c.diagramId !== diagramId) continue;
      byUser.set(c.userId, { userName: c.userName, canEdit: c.canEdit });
    }
    return Array.from(byUser.values());
  }

  /** Emite un evento a todos los que tienen abierto el diagrama (chat compartido con Trazo). */
  emitToDiagram(diagramId: string, event: string, payload: unknown): void {
    this.server?.to(roomOf(diagramId)).emit(event, payload);
  }

  // --- Internos ---

  private leave(client: Socket): void {
    const meta = this.clientMap.get(client.id);
    if (!meta) return;

    this.clientMap.delete(client.id);
    const room = roomOf(meta.diagramId);
    client.leave(room);

    // Liberar los bloqueos del usuario si ya no le queda otra pestaña abierta en el diagrama
    const stillConnected = this.participantsOf(meta.diagramId).some(
      (p) => p.userId === meta.userId,
    );
    if (!stillConnected) {
      const locks = this.locksOf(meta.diagramId);
      for (const [nodeId, lock] of locks) {
        if (lock.userId !== meta.userId) continue;
        locks.delete(nodeId);
        this.server
          .to(room)
          .emit('node_unlocked', { nodeId, userId: meta.userId });
      }
    }

    const participants = this.participantsOf(meta.diagramId);
    if (participants.length === 0) {
      this.nodeLocks.delete(meta.diagramId);
      this.snapshots.delete(meta.diagramId);
    }

    this.server.to(room).emit('user_left', {
      userId: meta.userId,
      userName: meta.userName,
      socketId: client.id,
    });
    this.server.to(room).emit('room_participants_updated', {
      diagramId: meta.diagramId,
      participants,
    });
  }

  /** Participantes únicos (un usuario puede tener varias pestañas abiertas). */
  private participantsOf(diagramId: string): Participant[] {
    const byUser = new Map<string, Participant>();
    for (const c of this.clientMap.values()) {
      if (c.diagramId !== diagramId) continue;
      byUser.set(c.userId, {
        userId: c.userId,
        userName: c.userName,
        color: c.color,
        isConnected: true,
      });
    }
    return Array.from(byUser.values());
  }

  private locksOf(diagramId: string): Map<string, NodeLockInfo> {
    let locks = this.nodeLocks.get(diagramId);
    if (!locks) {
      locks = new Map();
      this.nodeLocks.set(diagramId, locks);
    }
    return locks;
  }
}
