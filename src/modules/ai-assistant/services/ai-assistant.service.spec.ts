import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AiAssistantService,
  ChatUser,
  DRAFT_INTERVAL_MS,
} from './ai-assistant.service';
import {
  AI_PROVIDER,
  AI_VISION_PROVIDER,
  AiProviderUnavailableError,
} from '../providers/ai-provider';
import { CollaborationGateway } from '../../projects/gateways/collaboration.gateway';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { DiagramService } from '../../diagrams/services/diagram.service';
import { AiConversationService } from '../conversation/ai-conversation.service';
import { ActivityService } from '../../activity/activity.service';
import { TrazoSettingsService } from '../settings/trazo-settings.service';
import {
  DEFAULT_TRAZO_SETTINGS,
  TrazoSettingsValues,
} from '../settings/trazo-settings';
import { AiPromptDto } from '../dtos/ai-request.dto';
import { findNodeFuzzy } from '../domain/node-matching';
import { resolveManyToManyRelationships } from '../domain/many-to-many.resolver';

/** Conversaciones en memoria con la misma interfaz que las de MongoDB. */
class FakeConversations {
  messages: any[] = [];

  getActive = jest.fn(
    async (projectId: string, channel: string, author: any) => ({
      id: `conv-${channel}`,
      _id: `conv-${channel}`,
      projectId,
      channel,
      ownerId: channel === 'direct' ? author.userId : '',
      summary: '',
    }),
  );
  addMessage = jest.fn(async (conversation: any, message: any) => {
    const saved = {
      id: `m${this.messages.length + 1}`,
      status: 'success',
      createdAt: new Date(),
      conversationId: conversation.id,
      projectId: conversation.projectId,
      channel: conversation.channel,
      ...message,
    };
    this.messages.push(saved);
    return saved;
  });
  contextFor = jest.fn(async (conversation: any, excludeId?: string) => ({
    summary: '',
    history: this.messages.filter(
      (m) =>
        m.conversationId === conversation.id &&
        m.id !== excludeId &&
        m.status !== 'error',
    ),
  }));
  lastDiagramInThread = jest.fn(
    async () =>
      [...this.messages].reverse().find((m) => m.diagramId)?.diagramId,
  );
  messagesToSummarize = jest.fn(async () => null);
  findMessage = jest.fn(
    async (id: string) => this.messages.find((m) => m.id === id) || null,
  );
  markProposalApplied = jest.fn(async (id: string, by: any) => {
    const message = this.messages.find((m) => m.id === id);
    if (message?.proposal?.state !== 'pending') return null;
    message.proposal = { state: 'applied', appliedBy: by };
    return message;
  });
  revertProposal = jest.fn();
  replaceProposal = jest.fn(async (id: string) => {
    const message = this.messages.find((m) => m.id === id);
    if (message?.proposal?.state !== 'pending') return null;
    message.proposal = { state: 'replaced' };
    return message;
  });
  startReview = jest.fn(async (id: string, before: any, after: any) => {
    const message = this.messages.find((m) => m.id === id);
    if (!message) return null;
    message.review = { state: 'pending', before, after };
    return message;
  });
  decideReview = jest.fn(async (id: string, state: string, by?: any) => {
    const message = this.messages.find((m) => m.id === id);
    if (message?.review?.state !== 'pending') return null;
    message.review = { ...message.review, state, by };
    return message;
  });
  pendingReviewsOn = jest.fn(async (diagramId: string) =>
    this.messages.filter(
      (m) => m.diagramId === diagramId && m.review?.state === 'pending',
    ),
  );
  findConversation = jest.fn(async (id: string) => ({
    id,
    projectId: 'proj-1',
    channel: id === 'conv-direct' ? 'direct' : 'team',
    ownerId: id === 'conv-direct' ? 'user-1' : '',
  }));
  startNew = jest.fn(async (projectId: string, channel: string) => ({
    id: 'conv-new',
    projectId,
    channel,
    ownerId: '',
  }));
  toConversationDto = jest.fn((c: any) => ({ id: c.id, channel: c.channel }));
  toDto = jest.fn((m: any) => ({ ...m }));
}

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let aiProvider: { generate: jest.Mock; models: jest.Mock };
  let settings: { get: jest.Mock; save: jest.Mock };
  /** Configuración del proyecto que verá el próximo turno de Trazo. */
  const configure = (values: Partial<TrazoSettingsValues>) =>
    settings.get.mockResolvedValue({ ...DEFAULT_TRAZO_SETTINGS, ...values });
  let access: {
    assertProjectAccess: jest.Mock;
    assertDiagramAccess: jest.Mock;
    getDiagramContext: jest.Mock;
    listProjectDiagrams: jest.Mock;
    listProjectMembers: jest.Mock;
    getProjectName: jest.Mock;
  };
  let activity: {
    recent: jest.Mock;
    lastSeen: jest.Mock;
    summarySince: jest.Mock;
  };
  let diagrams: { findOne: jest.Mock; saveAst: jest.Mock; create: jest.Mock };
  let conversations: FakeConversations;
  let collaborationGateway: {
    broadcastAiMutation: jest.Mock;
    lockNodesForAi: jest.Mock;
    unlockNodesForAi: jest.Mock;
    emitToProject: jest.Mock;
    emitToUser: jest.Mock;
    latestSnapshot: jest.Mock;
    connectedUsers: jest.Mock;
  };

  const ana: ChatUser = { id: 'user-1', fullName: 'Ana Pérez' };

  /** Simula la respuesta JSON del modelo. */
  const mockModelResponse = (json: string) =>
    aiProvider.generate.mockResolvedValueOnce({
      text: json,
      model: 'trazo-test',
    });

  const run = (dto: AiPromptDto, user: ChatUser = ana) =>
    service.processTextPrompt(dto, user);

  beforeEach(async () => {
    aiProvider = {
      generate: jest.fn(),
      models: jest.fn().mockReturnValue(['trazo', 'qwen2.5-coder:7b']),
    };
    settings = {
      get: jest.fn().mockResolvedValue({ ...DEFAULT_TRAZO_SETTINGS }),
      save: jest.fn(async (_projectId: string, values: any, by: any) => ({
        ...values,
        updatedBy: by,
        updatedAt: new Date('2026-11-06T12:00:00Z'),
      })),
    };
    access = {
      assertProjectAccess: jest.fn().mockResolvedValue('EDITOR'),
      assertDiagramAccess: jest.fn().mockResolvedValue('EDITOR'),
      getDiagramContext: jest.fn().mockResolvedValue({
        projectId: 'proj-1',
        projectName: 'Tienda',
        diagramName: 'Ventas',
      }),
      listProjectDiagrams: jest
        .fn()
        .mockResolvedValue([
          { id: 'diag-123', name: 'Ventas', classNames: [] },
        ]),
      listProjectMembers: jest.fn().mockResolvedValue([
        { userId: 'user-1', userName: 'Ana Pérez' },
        { userId: 'user-2', userName: 'Luis Rojas' },
      ]),
      getProjectName: jest.fn().mockResolvedValue('Tienda'),
    };
    activity = {
      recent: jest.fn().mockResolvedValue([]),
      lastSeen: jest.fn().mockResolvedValue(undefined),
      summarySince: jest.fn((entry: { summary: string }) => entry.summary),
    };
    diagrams = {
      findOne: jest.fn().mockResolvedValue({ nodes: [], connections: [] }),
      saveAst: jest.fn().mockResolvedValue({}),
      create: jest.fn(async (dto: { name: string }) => ({
        id: 'diag-new',
        name: dto.name,
      })),
    };
    conversations = new FakeConversations();
    collaborationGateway = {
      broadcastAiMutation: jest.fn(),
      lockNodesForAi: jest.fn(),
      unlockNodesForAi: jest.fn(),
      emitToProject: jest.fn(),
      emitToUser: jest.fn(),
      latestSnapshot: jest.fn(),
      connectedUsers: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        { provide: AI_PROVIDER, useValue: aiProvider },
        { provide: AI_VISION_PROVIDER, useValue: aiProvider },
        { provide: CollaborationGateway, useValue: collaborationGateway },
        { provide: ProjectAccessService, useValue: access },
        { provide: DiagramService, useValue: diagrams },
        { provide: AiConversationService, useValue: conversations },
        { provide: ActivityService, useValue: activity },
        { provide: TrazoSettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get<AiAssistantService>(AiAssistantService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findNodeFuzzy', () => {
    it('debe encontrar nodos con nombres inexactos, plurales o con espacios', () => {
      const nodes = [
        {
          id: 'n1',
          name: 'DetalleCompra',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
        },
        {
          id: 'n2',
          name: 'Usuario',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
        },
      ];

      expect(findNodeFuzzy(nodes, 'Detalles de compra')?.name).toBe(
        'DetalleCompra',
      );
      expect(findNodeFuzzy(nodes, 'detalle de compra')?.name).toBe(
        'DetalleCompra',
      );
      expect(findNodeFuzzy(nodes, 'detalle_compra')?.name).toBe(
        'DetalleCompra',
      );
      expect(findNodeFuzzy(nodes, 'Usuarios')?.name).toBe('Usuario');
    });
  });

  describe('processTextPrompt', () => {
    it('debe eliminar la tabla y sus conexiones cuando se le pide "elimina la tabla Detalles de compra"', async () => {
      const currentNodes = [
        {
          id: 'node_compra',
          name: 'Compra',
          position: { x: 100, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'node_det_compra',
          name: 'DetalleCompra',
          position: { x: 400, y: 100 },
          attributes: [],
          methods: [],
        },
      ];
      const currentConnections = [
        {
          id: 'conn_1',
          sourceNodeId: 'node_compra',
          targetNodeId: 'node_det_compra',
          sourceId: 'node_compra_right',
          targetId: 'node_det_compra_left',
          type: 'composition',
        },
      ];

      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Tabla DetalleCompra eliminada',
          nodes: [
            {
              id: 'node_compra',
              name: 'Compra',
              position: { x: 100, y: 100 },
              attributes: [],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await run({
        prompt: 'elimina la tabla de Detalles de compra',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections,
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Compra');
      expect(result.connections).toHaveLength(0);
      expect(collaborationGateway.broadcastAiMutation).toHaveBeenCalledWith(
        'diag-123',
        result.nodes,
        result.connections,
      );
    });

    it('debe eliminar tablas cuando se usa infinitivo como "eliminar tabla DetalleCompra"', async () => {
      const currentNodes = [
        {
          id: 'node_compra',
          name: 'Compra',
          position: { x: 100, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'node_det_compra',
          name: 'DetalleCompra',
          position: { x: 400, y: 100 },
          attributes: [],
          methods: [],
        },
      ];

      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Tabla DetalleCompra eliminada',
          nodes: [
            {
              id: 'node_compra',
              name: 'Compra',
              position: { x: 100, y: 100 },
              attributes: [],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await run({
        prompt: 'eliminar tabla DetalleCompra',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Compra');
    });

    it('debe eliminar un atributo específico cuando se le pide', async () => {
      const currentNodes = [
        {
          id: 'node_user',
          name: 'Usuario',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'rol', type: 'String' },
          ],
          methods: [],
        },
      ];

      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Atributo rol eliminado',
          nodes: [
            {
              id: 'node_user',
              name: 'Usuario',
              position: { x: 100, y: 100 },
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await run({
        prompt: 'elimina el atributo rol de la tabla Usuario',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes[0].attributes).toHaveLength(1);
      expect(result.nodes[0].attributes[0].name).toBe('id');
    });

    it('debe mutar el diagrama agregando la nueva tabla y deduplicando atributos', async () => {
      const currentNodes = [
        {
          id: 'node_1',
          name: 'Usuario',
          position: { x: 100, y: 80 },
          width: 220,
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      const mockVertexResponse = JSON.stringify({
        isClarificationRequired: false,
        message: 'Se creó la tabla Producto y su relación con Usuario.',
        changesSummary:
          'Tabla Producto creada con 3 atributos y relación con Usuario',
        nodes: [
          {
            id: 'node_prod',
            name: 'Producto',
            position: { x: 760, y: 80 },
            width: 220,
            attributes: [
              { name: 'id', type: 'UUID' },
              { name: 'nombre', type: 'String' },
              { name: 'precio', type: 'Double' },
            ],
            methods: [{ name: 'getId', parameters: '', returnType: 'UUID' }],
          },
        ],
        connections: [
          {
            id: 'conn_prod_user',
            sourceNodeId: 'node_prod',
            targetNodeId: 'node_1',
            sourceId: 'node_prod_right',
            targetId: 'node_1_left',
            type: 'association',
            sourceMultiplicity: '*',
            targetMultiplicity: '1',
          },
        ],
      });

      mockModelResponse(mockVertexResponse);

      const result = await run({
        prompt:
          'Crea una tabla Producto con atributos id UUID, nombre String, precio Double y relacionala con Usuarios con multiplicidad *',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('diagram_mutated');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map((n) => n.name)).toContain('Usuario');
      expect(result.nodes.map((n) => n.name)).toContain('Producto');
    });

    it('debe eliminar los atributos de la tabla <<X>> sin eliminar la tabla ni las demás tablas', async () => {
      const currentNodes = [
        {
          id: 'node_x',
          name: 'Cliente',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'nombre', type: 'String' },
          ],
          methods: [],
        },
        {
          id: 'node_y',
          name: 'Pedido',
          position: { x: 400, y: 100 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Atributos de Cliente eliminados',
          nodes: [
            {
              id: 'node_x',
              name: 'Cliente',
              position: { x: 100, y: 100 },
              attributes: [],
              methods: [],
            },
            {
              id: 'node_y',
              name: 'Pedido',
              position: { x: 400, y: 100 },
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await run({
        prompt: 'Elimina los atributos de la tabla <<Cliente>>',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(2);
      const clienteNode = result.nodes.find((n) => n.name === 'Cliente');
      expect(clienteNode).toBeDefined();
      expect(clienteNode?.attributes).toHaveLength(0);
      const pedidoNode = result.nodes.find((n) => n.name === 'Pedido');
      expect(pedidoNode).toBeDefined();
      expect(pedidoNode?.attributes).toHaveLength(1);
    });

    it('NO debe vaciar el diagrama cuando se le pide "Elimina todos los atributos de la tabla<<X>>"', async () => {
      const currentNodes = [
        {
          id: 'node_x',
          name: 'Cliente',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'email', type: 'String' },
          ],
          methods: [],
        },
        {
          id: 'node_y',
          name: 'Factura',
          position: { x: 400, y: 100 },
          attributes: [{ name: 'total', type: 'Double' }],
          methods: [],
        },
      ];

      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Todos los atributos de la tabla Cliente eliminados',
          nodes: [
            {
              id: 'node_x',
              name: 'Cliente',
              position: { x: 100, y: 100 },
              attributes: [],
              methods: [],
            },
            {
              id: 'node_y',
              name: 'Factura',
              position: { x: 400, y: 100 },
              attributes: [{ name: 'total', type: 'Double' }],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await run({
        prompt: 'Elimina todos los atributos de la tabla<<Cliente>>',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      // El diagrama NO debe quedar vacío
      expect(result.nodes).toHaveLength(2);
      const clienteNode = result.nodes.find((n) => n.name === 'Cliente');
      expect(clienteNode).toBeDefined();
      expect(clienteNode?.attributes).toHaveLength(0);
      const facturaNode = result.nodes.find((n) => n.name === 'Factura');
      expect(facturaNode).toBeDefined();
      expect(facturaNode?.attributes).toHaveLength(1);
    });

    it('debe limpiar todo el diagrama cuando se solicita explícitamente "elimina todas las tablas"', async () => {
      const currentNodes = [
        {
          id: 'node_1',
          name: 'Usuario',
          position: { x: 100, y: 100 },
          attributes: [],
          methods: [],
        },
      ];

      const result = await run({
        prompt: 'elimina todas las tablas',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      expect(result.nodes).toHaveLength(0);
      expect(result.connections).toHaveLength(0);
    });

    it('debe eliminar en cascada la tabla intermedia AB y el ancla cuando se elimina la tabla A', async () => {
      const currentNodes = [
        {
          id: 'node_a',
          name: 'Tabla_A',
          position: { x: 100, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'node_b',
          name: 'Tabla_B',
          position: { x: 500, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'anchor_ab',
          name: '',
          position: { x: 300, y: 100 },
          width: 0,
          height: 0,
          isAnchor: true,
          attributes: [],
          methods: [],
        },
        {
          id: 'node_ab',
          name: 'Tabla_A_Tabla_B',
          position: { x: 300, y: 250 },
          assocMainConnId: 'conn_main',
          attributes: [],
          methods: [],
        },
      ];

      const currentConnections = [
        {
          id: 'conn_main',
          sourceNodeId: 'node_a',
          targetNodeId: 'node_b',
          sourceId: 'node_a_right',
          targetId: 'node_b_left',
          type: 'association',
          assocAnchorNodeId: 'anchor_ab',
        },
        {
          id: 'conn_dashed',
          sourceNodeId: 'anchor_ab',
          targetNodeId: 'node_ab',
          sourceId: 'anchor_ab',
          targetId: 'node_ab_top',
          type: 'association_class',
        },
      ];

      // La IA devuelve que solo queda Tabla_B (o incluso si devuelve Tabla_B y Tabla_A_Tabla_B por descuido)
      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Tabla Tabla_A eliminada',
          nodes: [
            {
              id: 'node_b',
              name: 'Tabla_B',
              position: { x: 500, y: 100 },
              attributes: [],
              methods: [],
            },
          ],
          connections: [],
        }),
      );

      const result = await run({
        prompt: 'elimina la tabla Tabla_A',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections,
      });

      expect(result.success).toBe(true);
      // Solo debe quedar Tabla_B
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].name).toBe('Tabla_B');
      // Todas las conexiones hacia A o AB deben desaparecer
      expect(result.connections).toHaveLength(0);
    });

    it('debe generar automáticamente la tabla intermedia y el ancla para relaciones muchos a muchos sin tabla intermedia', async () => {
      const currentNodes = [
        {
          id: 'node_estudiante',
          name: 'Estudiante',
          position: { x: 100, y: 100 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_curso',
          name: 'Curso',
          position: { x: 500, y: 100 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      const currentConnections = [
        {
          id: 'conn_mn',
          sourceNodeId: 'node_estudiante',
          targetNodeId: 'node_curso',
          sourceId: 'node_estudiante_right',
          targetId: 'node_curso_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      // Simulamos que la IA devuelve el diagrama con la relación muchos a muchos directa
      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Relación muchos a muchos procesada',
          nodes: currentNodes,
          connections: currentConnections,
        }),
      );

      const result = await run({
        prompt: 'genera la tabla intermedia de la relación muchos a muchos',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections,
      });

      expect(result.success).toBe(true);
      // Debe haber 4 nodos: Estudiante, Curso, Ancla e Intermedia
      expect(result.nodes).toHaveLength(4);

      const anchorNode = result.nodes.find((n) => n.isAnchor);
      expect(anchorNode).toBeDefined();
      expect(anchorNode?.width).toBe(0);

      const assocNode = result.nodes.find((n) => n.name === 'Estudiante_Curso');
      expect(assocNode).toBeDefined();
      expect(assocNode?.assocMainConnId).toBe('conn_mn');
      expect(assocNode?.attributes).toEqual([
        { name: 'estudianteId', type: 'UUID', visibility: 'private' },
        { name: 'cursoId', type: 'UUID', visibility: 'private' },
      ]);
      expect(assocNode?.attributes.map((a) => a.name)).not.toContain('id');
      expect(assocNode?.attributes.map((a) => a.name)).not.toContain(
        'fechaRegistro',
      );

      // Debe haber 2 conexiones: la principal y la de enlace «link»
      expect(result.connections).toHaveLength(2);
      const mainConn = result.connections.find((c) => c.id === 'conn_mn');
      expect(mainConn?.assocAnchorNodeId).toBe(anchorNode?.id);

      const dashedConn = result.connections.find(
        (c) => c.type === 'association_class',
      );
      expect(dashedConn).toBeDefined();
      expect(dashedConn?.name).toBe('«link»');
      expect(dashedConn?.sourceNodeId).toBe(anchorNode?.id);
      expect(dashedConn?.targetNodeId).toBe(assocNode?.id);
    });

    it('debe descartar tablas intermedias y conexiones alucinadas cuando el usuario solo pide agregar una tabla concreta sin relaciones', async () => {
      const currentNodes = [
        {
          id: 'node_prod',
          name: 'Products',
          position: { x: 100, y: 100 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      // Simulamos que el LLM alucina agregando Usuario_Products, OrderProduct y una conexión M:N
      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          action: 'diagram_mutated',
          message: 'Usuario agregado',
          nodes: [
            ...currentNodes,
            {
              id: 'node_user',
              name: 'Usuario',
              position: { x: 400, y: 100 },
              attributes: [
                { name: 'id', type: 'UUID' },
                { name: 'name', type: 'String' },
                { name: 'email', type: 'String' },
              ],
              methods: [],
            },
            {
              id: 'node_user_prod',
              name: 'Usuario_Products',
              position: { x: 250, y: 300 },
              attributes: [
                { name: 'usuarioId', type: 'UUID' },
                { name: 'productId', type: 'Long' },
              ],
              methods: [],
            },
            {
              id: 'node_order_prod',
              name: 'OrderProduct',
              position: { x: 600, y: 300 },
              attributes: [
                { name: 'orderId', type: 'Long' },
                { name: 'productId', type: 'Long' },
              ],
              methods: [],
            },
          ],
          connections: [
            {
              id: 'conn_alucinada',
              sourceNodeId: 'node_user',
              targetNodeId: 'node_prod',
              type: 'association',
              sourceMultiplicity: '*',
              targetMultiplicity: '*',
            },
          ],
        }),
      );

      const result = await run({
        prompt: 'agrega una tabla usuario con id, name y email',
        diagramId: 'diag-123',
        currentNodes,
        currentConnections: [],
      });

      expect(result.success).toBe(true);
      // Solo deben existir Products y Usuario (NO Usuario_Products ni OrderProduct)
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.map((n) => n.name).sort()).toEqual([
        'Products',
        'Usuario',
      ]);

      // No debe haberse creado la conexión alucinada
      expect(result.connections).toHaveLength(0);
    });
  });

  describe('orquestación', () => {
    const baseDto = {
      prompt: 'agrega una tabla Pago con id UUID',
      diagramId: 'diag-123',
      currentNodes: [],
      currentConnections: [],
    };

    it('acepta el mensaje y lo difunde sin esperar a que responda el modelo', async () => {
      let answer!: (value: { text: string; model: string }) => void;
      aiProvider.generate.mockReturnValueOnce(
        new Promise((resolve) => (answer = resolve)),
      );

      const { message, result } = await service.submitMessage(
        'proj-1',
        {
          channel: 'direct',
          text: baseDto.prompt,
          clientId: 'c-1',
          activeDiagramId: 'diag-123',
        },
        ana,
      );
      expect(message).toMatchObject({ role: 'user', clientId: 'c-1' });
      expect(collaborationGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'chat_message',
        expect.objectContaining({ role: 'user' }),
      );

      answer({
        text: JSON.stringify({
          reply: 'Ana, ok',
          intent: 'answer',
          operations: [],
        }),
        model: 'trazo-test',
      });
      await expect(result).resolves.toMatchObject({ action: 'answer' });
    });

    it('rechaza a quien no es miembro sin llamar al modelo', async () => {
      access.assertProjectAccess.mockRejectedValueOnce(
        new ForbiddenException(),
      );
      await expect(run(baseDto)).rejects.toThrow(ForbiddenException);
      expect(aiProvider.generate).not.toHaveBeenCalled();
    });

    it('envía al modelo la conversación con el nombre de cada persona', async () => {
      conversations.messages.push(
        {
          id: 'm-a',
          conversationId: 'conv-direct',
          role: 'user',
          author: { userId: 'user-2', userName: 'Luis Rojas' },
          text: 'crea la tabla Cliente',
          status: 'success',
        },
        {
          id: 'm-b',
          conversationId: 'conv-direct',
          role: 'assistant',
          author: { userId: 'ai_assistant', userName: 'Trazo' },
          text: 'Luis, creé Cliente',
          intent: 'edit',
          changesSummary: 'Clase Cliente',
          status: 'success',
        },
      );
      mockModelResponse(
        JSON.stringify({
          reply: 'Ana, claro.',
          intent: 'answer',
          operations: [],
        }),
      );
      collaborationGateway.connectedUsers.mockReturnValue([
        { userName: 'Ana Pérez', canEdit: true },
        { userName: 'Luis Rojas', canEdit: false },
      ]);

      await run(baseDto);

      const request = aiProvider.generate.mock.calls[0][0];
      expect(request.history).toEqual([
        { role: 'user', text: 'Luis Rojas: crea la tabla Cliente' },
        {
          role: 'assistant',
          text: 'Luis, creé Cliente\n[Cambios aplicados: Clase Cliente]',
        },
      ]);
      expect(request.schema).toBeDefined();
      const sent = request.parts[0].text as string;
      expect(sent).toContain('PROYECTO: Tienda');
      expect(sent).toContain('Ana Pérez (editor), Luis Rojas (solo lectura)');
      expect(sent).toContain('LIENZO: #Ventas');
      expect(sent).toContain('MENSAJE DE Ana Pérez (puede editar)');
    });

    it('responde una pregunta sin tocar el diagrama, dirigiéndose a quien pregunta', async () => {
      mockModelResponse(
        JSON.stringify({
          reply:
            'Un atributo derivado se calcula a partir de otros, como /total en Pedido.',
          intent: 'answer',
          operations: [],
        }),
      );
      const result = await run({
        ...baseDto,
        prompt: '¿qué es un atributo derivado?',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('answer');
      expect(result.message).toBe(
        'Ana, un atributo derivado se calcula a partir de otros, como /total en Pedido.',
      );
      expect(collaborationGateway.broadcastAiMutation).not.toHaveBeenCalled();
      expect(diagrams.saveAst).not.toHaveBeenCalled();
      // La conversación privada solo le llega a Ana
      const sent = collaborationGateway.emitToUser.mock.calls
        .filter(([, event]) => event === 'chat_message')
        .map(([userId, , message]) => [
          userId,
          message.role,
          message.author.userName,
        ]);
      expect(sent).toEqual([
        ['user-1', 'user', 'Ana Pérez'],
        ['user-1', 'assistant', 'Trazo'],
      ]);
      expect(collaborationGateway.emitToProject).not.toHaveBeenCalledWith(
        'proj-1',
        'chat_message',
        expect.anything(),
      );
    });

    it('convierte en propuesta el cambio que pide alguien de solo lectura', async () => {
      access.assertProjectAccess.mockResolvedValueOnce('VIEWER');
      mockModelResponse(
        JSON.stringify({
          reply: 'Ana, creé Pago.',
          intent: 'edit',
          changesSummary: 'Clase Pago',
          operations: [
            { op: 'add_class', name: 'Pago', attributes: [], methods: [] },
          ],
        }),
      );
      const result = await run(baseDto);

      expect(result.action).toBe('proposal');
      expect(collaborationGateway.broadcastAiMutation).not.toHaveBeenCalled();
      expect(collaborationGateway.lockNodesForAi).toHaveBeenCalledWith(
        'diag-123',
        [],
      );
      expect(conversations.messages[1]).toMatchObject({
        proposal: { state: 'pending' },
        diagramId: 'diag-123',
        diagramName: 'Ventas',
      });
    });

    it('muestra a Trazo escribiendo en vivo y cierra el borrador con el mensaje final', async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const chunks = [
        '{"reply":"Ana, cre',
        'é Pago","intent":"edit","changesSummary":"Clase Pago","operations":[{"op":"add_class","name":"Pago","attributes":[{"name":"id","type":"UUID"}]}',
        ']}',
      ];
      aiProvider.generate.mockImplementationOnce(async (request) => {
        for (const chunk of chunks) {
          await sleep(DRAFT_INTERVAL_MS + 30);
          request.onDelta(chunk);
        }
        await sleep(DRAFT_INTERVAL_MS + 30);
        return { text: chunks.join(''), model: 'trazo-test' };
      });

      await run(baseDto);

      const events = collaborationGateway.emitToUser.mock.calls
        .filter(([, event]) => ['trazo_draft', 'chat_message'].includes(event))
        .map(([, event, payload]) =>
          event === 'chat_message'
            ? `mensaje ${payload.role}`
            : `${payload.phase}: ${payload.text}${payload.actions.length ? ` [${payload.actions.join('; ')}]` : ''}`,
        );
      expect(events).toEqual([
        'mensaje user',
        'reading: ',
        'writing: Ana, cre',
        // Un borrador que no cambia no se reenvía
        'preparing: Ana, creé Pago [crea la clase Pago con id: UUID]',
        'mensaje assistant',
      ]);
      const draft = collaborationGateway.emitToUser.mock.calls.find(
        ([, event]) => event === 'trazo_draft',
      )[2];
      expect(draft).toMatchObject({
        channel: 'direct',
        replyTo: conversations.messages[0].id,
        diagramName: 'Ventas',
      });
    });

    describe('configuración del proyecto («Configurar Trazo»)', () => {
      const editReply = JSON.stringify({
        reply: 'Ana, creé Pago.',
        intent: 'edit',
        changesSummary: 'Clase Pago',
        operations: [
          { op: 'add_class', name: 'Pago', attributes: [], methods: [] },
        ],
      });

      it('en «siempre propone» deja el cambio como propuesta aunque el modelo lo aplique', async () => {
        configure({ delivery: 'propose' });
        mockModelResponse(editReply);
        const result = await run(baseDto);

        expect(result.action).toBe('proposal');
        expect(diagrams.saveAst).not.toHaveBeenCalled();
        expect(collaborationGateway.broadcastAiMutation).not.toHaveBeenCalled();
        expect(conversations.messages[1]).toMatchObject({
          intent: 'propose',
          proposal: { state: 'pending' },
        });
        // El modelo dijo «creé Pago»: el texto lo corrige el orquestador
        expect(conversations.messages[1].text).toBe(
          'Ana, te dejo la propuesta para que el equipo la revise antes de aplicarla: Clase Pago. Cualquier editor puede pulsar «Aplicar».',
        );
        const prompt = aiProvider.generate.mock.calls[0][0].parts[0].text;
        expect(prompt).toContain('NUNCA uses "edit"');
      });

      it('en «solo explica» no toca el diagrama ni deja propuestas', async () => {
        configure({ delivery: 'explain' });
        mockModelResponse(editReply);
        const result = await run(baseDto);

        expect(result.action).toBe('answer');
        expect(diagrams.saveAst).not.toHaveBeenCalled();
        expect(conversations.messages[1].intent).toBe('answer');
        expect(conversations.messages[1].proposal).toBeUndefined();
        expect(conversations.messages[1].text).toBe(
          'Ana, en este proyecto solo explico, sin tocar el diagrama. Para hacerlo en el editor: crea la clase Pago.',
        );
      });

      it('en «solo explica» no vacía el diagrama sin preguntar al modelo', async () => {
        configure({ delivery: 'explain' });
        mockModelResponse(
          JSON.stringify({
            reply: 'Ana, para vaciarlo selecciona todo y pulsa Suprimir.',
            intent: 'answer',
            operations: [],
          }),
        );
        const result = await run({
          ...baseDto,
          prompt: 'elimina todas las tablas',
        });

        expect(result.action).toBe('answer');
        expect(aiProvider.generate).toHaveBeenCalled();
        expect(diagrams.saveAst).not.toHaveBeenCalled();
      });

      it('pasa al modelo el estilo, la creatividad y el modelo elegidos', async () => {
        configure({
          style: 'brief',
          creativity: 'creative',
          model: 'qwen2.5-coder:7b',
        });
        mockModelResponse(
          JSON.stringify({
            reply: 'Ana, ok',
            intent: 'answer',
            operations: [],
          }),
        );
        await run({ ...baseDto, prompt: '¿qué es una composición?' });

        const request = aiProvider.generate.mock.calls[0][0];
        expect(request).toMatchObject({
          temperature: 0.6,
          model: 'qwen2.5-coder:7b',
        });
        expect(request.parts[0].text).toContain('1 a 3 frases');
      });

      it('devuelve la configuración predeterminada con los modelos disponibles', async () => {
        access.assertProjectAccess.mockResolvedValueOnce('VIEWER');
        await expect(service.getTrazoSettings('proj-1', ana)).resolves.toEqual({
          delivery: 'apply',
          style: 'mentor',
          creativity: 'balanced',
          model: 'trazo',
          models: ['trazo', 'qwen2.5-coder:7b'],
          canEdit: false,
        });
      });

      it('un cambio se guarda, Trazo lo anuncia en el canal del equipo y llega a todos', async () => {
        const result = await service.updateTrazoSettings(
          'proj-1',
          {
            delivery: 'propose',
            style: 'brief',
            creativity: 'balanced',
            model: 'trazo',
          },
          ana,
        );

        expect(access.assertProjectAccess).toHaveBeenCalledWith(
          'proj-1',
          'user-1',
          'write',
        );
        // El modelo predeterminado no se guarda
        expect(settings.save).toHaveBeenCalledWith(
          'proj-1',
          { delivery: 'propose', style: 'brief', creativity: 'balanced' },
          { userId: 'user-1', userName: 'Ana Pérez' },
        );
        expect(result).toMatchObject({ delivery: 'propose', canEdit: true });
        expect(conversations.messages).toEqual([
          expect.objectContaining({
            channel: 'team',
            role: 'assistant',
            text: expect.stringContaining(
              'Ana Pérez cambió cómo trabajo en este proyecto: ahora dejo los cambios como propuesta',
            ),
          }),
        ]);
        expect(collaborationGateway.emitToProject).toHaveBeenCalledWith(
          'proj-1',
          'trazo_settings',
          expect.objectContaining({ delivery: 'propose', style: 'brief' }),
        );
      });

      it('sin cambios no guarda ni anuncia nada', async () => {
        await service.updateTrazoSettings(
          'proj-1',
          { ...DEFAULT_TRAZO_SETTINGS, model: 'trazo' },
          ana,
        );
        expect(settings.save).not.toHaveBeenCalled();
        expect(conversations.messages).toHaveLength(0);
      });

      it('rechaza un modelo que el servidor no ofrece', async () => {
        await expect(
          service.updateTrazoSettings(
            'proj-1',
            { ...DEFAULT_TRAZO_SETTINGS, model: 'gpt-x' },
            ana,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(settings.save).not.toHaveBeenCalled();
      });

      it('quien solo puede ver no la cambia', async () => {
        access.assertProjectAccess.mockRejectedValueOnce(
          new ForbiddenException(),
        );
        await expect(
          service.updateTrazoSettings(
            'proj-1',
            { ...DEFAULT_TRAZO_SETTINGS, delivery: 'explain' },
            ana,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(settings.save).not.toHaveBeenCalled();
      });
    });

    describe('responder a un mensaje («Responder»)', () => {
      const team = (text: string, extra: Record<string, unknown> = {}) =>
        service.submitMessage(
          'proj-1',
          { channel: 'team', text, activeDiagramId: 'diag-123', ...extra },
          ana,
        );
      const trazoSaid = (extra: Record<string, unknown> = {}) => {
        const message = {
          id: 'm-trazo',
          conversationId: 'conv-team',
          projectId: 'proj-1',
          channel: 'team',
          role: 'assistant',
          author: { userId: 'ai_assistant', userName: 'Trazo' },
          text: 'Ana, te propongo la clase Pago con id y monto.',
          diagramId: 'diag-otro',
          ...extra,
        };
        conversations.messages.push(message);
        return message;
      };

      it('responder a Trazo lo llama sin escribir @Trazo y guarda la cita', async () => {
        trazoSaid();
        mockModelResponse(
          JSON.stringify({
            reply: 'Ana, claro.',
            intent: 'answer',
            operations: [],
          }),
        );
        const { message, result } = await team('¿y por qué BigDecimal?', {
          quoteOf: 'm-trazo',
        });

        expect(message).toMatchObject({
          mentions: ['ai_assistant'],
          quote: {
            messageId: 'm-trazo',
            authorName: 'Trazo',
            isTrazo: true,
            text: 'Ana, te propongo la clase Pago con id y monto.',
          },
        });
        await expect(result).resolves.toMatchObject({ action: 'answer' });
        const prompt = aiProvider.generate.mock.calls[0][0].parts[0].text;
        expect(prompt).toContain(
          'RESPONDE A ESTE MENSAJE DE TI (Trazo): "Ana, te propongo la clase Pago con id y monto."',
        );
      });

      it('responder a una persona no llama a Trazo', async () => {
        conversations.messages.push({
          id: 'm-luis',
          conversationId: 'conv-team',
          role: 'user',
          author: { userId: 'user-2', userName: 'Luis Rojas' },
          text: 'Yo hago Inventario',
        });
        const { message, result } = await team('Perfecto, yo Ventas', {
          quoteOf: 'm-luis',
        });
        expect(result).toBeUndefined();
        expect(message.quote).toMatchObject({
          authorName: 'Luis Rojas',
          isTrazo: false,
        });
        expect(aiProvider.generate).not.toHaveBeenCalled();
      });

      it('corrige una propuesta pendiente en su diagrama y la anterior queda reemplazada', async () => {
        access.listProjectDiagrams.mockResolvedValue([
          { id: 'diag-123', name: 'Ventas', classNames: [] },
          { id: 'diag-otro', name: 'Pagos', classNames: [] },
        ]);
        const old = trazoSaid({
          intent: 'propose',
          changesSummary: 'Clase Pago (id, monto)',
          operations: [
            {
              op: 'add_class',
              name: 'Pago',
              attributes: [
                { name: 'id', type: 'UUID' },
                { name: 'monto', type: 'BigDecimal' },
              ],
            },
          ],
          proposal: { state: 'pending' },
        });
        mockModelResponse(
          JSON.stringify({
            reply: 'Ana, pon monto como Double.',
            intent: 'propose',
            changesSummary: 'Clase Pago (id, monto: Double)',
            // Como hace a menudo el modelo pequeño: solo el cambio, no la propuesta completa
            operations: [
              {
                op: 'update_class',
                target: 'Pago',
                updateAttributes: [{ name: 'monto', type: 'Double' }],
              },
            ],
          }),
        );
        const { result } = await team('pon monto como Double', {
          quoteOf: 'm-trazo',
        });
        await result;

        const prompt = aiProvider.generate.mock.calls[0][0].parts[0].text;
        expect(prompt).toContain(
          'ESA ES TU PROPUESTA, AÚN SIN APLICAR: Clase Pago (id, monto)',
        );
        expect(prompt).toContain('"monto","type":"BigDecimal"');
        expect(prompt).toContain('TAREA: este mensaje responde a TU PROPUESTA');
        // Trabaja en el diagrama de la propuesta, no en el que está abierto
        expect(prompt).toContain(
          'LIENZO: #Pagos (es el del mensaje al que responde)',
        );
        expect(old.proposal.state).toBe('replaced');
        expect(conversations.messages.at(-1)).toMatchObject({
          intent: 'propose',
          proposal: { state: 'pending' },
          text: 'Ana, te corregí la propuesta: Clase Pago (id, monto: Double). Reemplaza a la anterior; cualquier editor puede pulsar «Aplicar».',
          operations: [
            {
              op: 'add_class',
              name: 'Pago',
              attributes: [
                { name: 'id', type: 'UUID' },
                { name: 'monto', type: 'Double' },
              ],
            },
          ],
        });
        await expect(
          service.previewProposal('m-trazo', {}, ana),
        ).rejects.toThrow(ConflictException);
      });

      it('ignora una cita de otra conversación', async () => {
        trazoSaid({ conversationId: 'conv-direct' });
        const { message, result } = await team('hola equipo', {
          quoteOf: 'm-trazo',
        });
        expect(message.quote).toBeUndefined();
        expect(result).toBeUndefined();
      });
    });

    describe('revisión de los cambios de Trazo', () => {
      const pago = JSON.stringify({
        reply: 'Ana, creé Pago.',
        intent: 'edit',
        changesSummary: 'Clase Pago',
        operations: [
          { op: 'add_class', name: 'Pago', attributes: [], methods: [] },
        ],
      });
      const cliente = {
        id: 'c',
        name: 'Cliente',
        position: { x: 0, y: 0 },
        attributes: [{ name: 'id', type: 'UUID' }],
        methods: [],
      };
      const withCliente = { ...baseDto, currentNodes: [cliente] };
      const edited = () =>
        conversations.messages.find((m) => m.intent === 'edit');

      it('cada edición queda pendiente de revisión con el diagrama antes y después', async () => {
        mockModelResponse(pago);
        await run(withCliente);

        const message = edited();
        expect(message.review.state).toBe('pending');
        expect(message.review.before.nodes.map((n: any) => n.name)).toEqual([
          'Cliente',
        ]);
        expect(message.review.after.nodes.map((n: any) => n.name)).toEqual([
          'Cliente',
          'Pago',
        ]);
      });

      it('un cambio nuevo en el mismo diagrama da por aceptado el anterior', async () => {
        mockModelResponse(pago);
        await run(withCliente);
        const first = edited();
        mockModelResponse(pago.replace(/Pago/g, 'Factura'));
        await run(withCliente);

        expect(first.review.state).toBe('accepted');
        expect(
          conversations.messages.filter((m) => m.review?.state === 'pending'),
        ).toHaveLength(1);
      });

      it('aceptar quita el resaltado sin tocar el diagrama', async () => {
        mockModelResponse(pago);
        await run(withCliente);
        diagrams.saveAst.mockClear();

        const result = await service.reviewChange(
          edited().id,
          { decision: 'accept' },
          ana,
        );
        expect(result.action).toBe('review_accepted');
        expect(edited().review).toMatchObject({
          state: 'accepted',
          by: { userName: 'Ana Pérez' },
        });
        expect(diagrams.saveAst).not.toHaveBeenCalled();
        await expect(
          service.reviewChange(edited().id, { decision: 'revert' }, ana),
        ).rejects.toThrow(ConflictException);
      });

      it('deshacer revierte solo lo de Trazo, lo guarda a nombre de quien deshace y lo cuenta', async () => {
        mockModelResponse(pago);
        await run(withCliente);
        diagrams.saveAst.mockClear();
        const luis = { id: 'user-2', fullName: 'Luis Rojas' };
        const pagoNode = edited().review.after.nodes[1];
        // Fue en la conversación privada de Ana: Luis ni la ve ni la deshace
        await expect(
          service.reviewChange(edited().id, { decision: 'revert' }, luis),
        ).rejects.toThrow(NotFoundException);
        // Ana agregó un atributo a Cliente después del cambio de Trazo
        const current = [
          {
            ...cliente,
            attributes: [
              ...cliente.attributes,
              { name: 'email', type: 'String' },
            ],
          },
          pagoNode,
        ];

        const result = await service.reviewChange(
          edited().id,
          {
            decision: 'revert',
            activeDiagramId: 'diag-123',
            currentNodes: current,
            currentConnections: [],
          },
          ana,
        );

        expect(result.nodes.map((n) => n.name)).toEqual(['Cliente']);
        expect(result.nodes[0].attributes.map((a) => a.name)).toEqual([
          'id',
          'email',
        ]);
        expect(diagrams.saveAst).toHaveBeenCalledWith(
          'diag-123',
          expect.anything(),
          'user-1',
          { userId: 'user-1', userName: 'Ana Pérez' },
        );
        expect(
          collaborationGateway.broadcastAiMutation,
        ).toHaveBeenLastCalledWith(
          'diag-123',
          result.nodes,
          result.connections,
        );
        expect(edited().review.state).toBe('reverted');
        expect(conversations.messages.at(-1).text).toBe(
          'Ana Pérez deshizo los cambios que hice en #Ventas (Clase Pago).',
        );
      });

      it('no deshace un cambio con el antes o el después incompletos', async () => {
        mockModelResponse(pago);
        await run(withCliente);
        edited().review.before = { nodes: [[]], connections: [] };
        diagrams.saveAst.mockClear();

        await expect(
          service.reviewChange(edited().id, { decision: 'revert' }, ana),
        ).rejects.toThrow(BadRequestException);
        expect(diagrams.saveAst).not.toHaveBeenCalled();
        expect(edited().review.state).toBe('pending');
      });

      it('quien solo puede ver no acepta ni deshace', async () => {
        mockModelResponse(pago);
        await run(withCliente);
        access.assertDiagramAccess.mockRejectedValueOnce(
          new ForbiddenException(),
        );
        await expect(
          service.reviewChange(edited().id, { decision: 'accept' }, ana),
        ).rejects.toThrow(ForbiddenException);
        expect(edited().review.state).toBe('pending');
      });
    });

    describe('vista previa de una propuesta', () => {
      const proposal = (state: 'pending' | 'applied' = 'pending') =>
        conversations.messages.push({
          id: 'm-prop',
          conversationId: 'conv-team',
          projectId: 'proj-1',
          channel: 'team',
          diagramId: 'diag-123',
          role: 'assistant',
          text: 'Ana, te propongo Pago',
          changesSummary: 'Clase Pago',
          operations: [
            { op: 'add_class', name: 'Pago', attributes: [], methods: [] },
          ],
          proposal: { state },
        });
      const open = {
        activeDiagramId: 'diag-123',
        currentNodes: [
          {
            id: 'c',
            name: 'Cliente',
            position: { x: 0, y: 0 },
            attributes: [],
            methods: [],
          },
        ],
        currentConnections: [],
      };

      it('calcula cómo quedaría el diagrama sin guardar ni avisar a nadie', async () => {
        proposal();
        access.assertDiagramAccess.mockResolvedValueOnce('VIEWER');
        const preview = await service.previewProposal('m-prop', open, ana);

        // Basta con poder ver el diagrama
        expect(access.assertDiagramAccess).toHaveBeenCalledWith(
          'diag-123',
          'user-1',
          'read',
        );
        expect(preview).toMatchObject({
          messageId: 'm-prop',
          diagramId: 'diag-123',
          changesSummary: 'Clase Pago',
          skipped: [],
        });
        expect(preview.nodes.map((n) => n.name)).toEqual(['Cliente', 'Pago']);
        // El diagrama existente conserva sus ids, para poder resaltar las diferencias
        expect(preview.nodes[0].id).toBe('c');
        expect(diagrams.saveAst).not.toHaveBeenCalled();
        expect(collaborationGateway.broadcastAiMutation).not.toHaveBeenCalled();
        expect(conversations.markProposalApplied).not.toHaveBeenCalled();
      });

      it('no hay vista previa de una propuesta ya aplicada', async () => {
        proposal('applied');
        await expect(
          service.previewProposal('m-prop', open, ana),
        ).rejects.toThrow(ConflictException);
      });
    });

    it('aplica una propuesta una sola vez y la guarda en su diagrama', async () => {
      conversations.messages.push({
        id: 'm-prop',
        conversationId: 'conv-team',
        projectId: 'proj-1',
        channel: 'team',
        diagramId: 'diag-123',
        role: 'assistant',
        text: 'Ana, te propongo Pago',
        changesSummary: 'Clase Pago',
        operations: [
          { op: 'add_class', name: 'Pago', attributes: [], methods: [] },
        ],
        proposal: { state: 'pending' },
      });
      const currentNodes = [
        {
          id: 'c',
          name: 'Cliente',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
        },
      ];
      const luis = { id: 'user-2', fullName: 'Luis Rojas' };

      const result = await service.applyProposal(
        'm-prop',
        { activeDiagramId: 'diag-123', currentNodes, currentConnections: [] },
        luis,
      );
      expect(result.nodes.map((n) => n.name)).toEqual(['Cliente', 'Pago']);
      expect(result.assistantMessage?.proposal?.appliedBy?.userName).toBe(
        'Luis Rojas',
      );
      expect(diagrams.saveAst).toHaveBeenCalledWith(
        'diag-123',
        expect.objectContaining({ nodes: expect.any(Array) }),
        'user-2',
        {
          userId: 'ai_assistant',
          userName: 'Trazo (a pedido de Luis)',
          onBehalfOf: { userId: 'user-2', userName: 'Luis Rojas' },
        },
      );
      expect(collaborationGateway.broadcastAiMutation).toHaveBeenCalled();
      expect(collaborationGateway.emitToProject).toHaveBeenCalledWith(
        'proj-1',
        'chat_message',
        expect.objectContaining({ id: 'm-prop' }),
      );

      await expect(
        service.applyProposal('m-prop', { currentNodes }, luis),
      ).rejects.toThrow(ConflictException);
    });

    it('usa el diagrama más reciente de la sala si cambió mientras esperaba turno', async () => {
      collaborationGateway.latestSnapshot.mockReturnValue({
        nodes: [
          {
            id: 'x',
            name: 'Factura',
            position: { x: 0, y: 0 },
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
        at: Date.now() + 1000,
      });
      mockModelResponse(
        JSON.stringify({ reply: 'Ana, ok', intent: 'answer', operations: [] }),
      );
      await run(baseDto);
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text as string;
      expect(sent).toContain('- Factura {  }');
    });

    it('devuelve un aviso claro y libera los bloqueos si el proveedor está saturado', async () => {
      aiProvider.generate.mockRejectedValueOnce(
        new AiProviderUnavailableError('503'),
      );
      const currentNodes = [
        {
          id: 'n1',
          name: 'Pago',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
        },
      ];
      const result = await run({ ...baseDto, currentNodes });
      expect(result.success).toBe(false);
      expect(result.action).toBe('ai_unavailable');
      expect(result.nodes).toEqual(currentNodes);
      expect(collaborationGateway.lockNodesForAi).toHaveBeenCalledWith(
        'diag-123',
        ['n1'],
      );
      expect(collaborationGateway.unlockNodesForAi).toHaveBeenCalledWith(
        'diag-123',
        ['n1'],
      );
      expect(collaborationGateway.broadcastAiMutation).not.toHaveBeenCalled();
    });
    it('aplica las operaciones del modelo y le envía el diagrama en texto compacto', async () => {
      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          message: 'Agregué stock a Producto',
          changesSummary: 'stock: Integer',
          operations: [
            {
              op: 'update_class',
              target: 'Producto',
              addAttributes: [{ name: 'stock', type: 'Integer' }],
            },
          ],
        }),
      );
      const currentNodes = [
        {
          id: 'p',
          name: 'Producto',
          position: { x: 0, y: 0 },
          attributes: [{ name: 'nombre', type: 'String' }],
          methods: [],
        },
      ];
      const result = await run({
        ...baseDto,
        prompt: 'agrégale stock Integer a Producto',
        currentNodes,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Ana, agregué stock a Producto');
      expect(result.nodes[0].attributes.map((a) => a.name)).toEqual([
        'nombre',
        'stock',
      ]);
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text as string;
      expect(sent).toContain('- Producto { nombre: String }');
      expect(sent).not.toContain('"attributes"');
    });

    it('acepta nodos en formato del API y nodos del modelo sin posición', async () => {
      mockModelResponse(
        JSON.stringify({
          isClarificationRequired: false,
          nodes: [
            { id: 'a', name: 'Alumno', attributes: [], methods: [] },
            { id: 'c', name: 'Curso', attributes: [], methods: [] },
          ],
          connections: [
            {
              id: 'r',
              sourceNodeId: 'a',
              targetNodeId: 'c',
              type: 'association',
              sourceMultiplicity: '*',
              targetMultiplicity: '*',
            },
          ],
        }),
      );
      const currentNodes = [
        {
          id: 'a',
          name: 'Alumno',
          positionX: 100,
          positionY: 50,
          attributes: [],
          methods: [],
        },
      ] as any[];
      const result = await run({
        ...baseDto,
        prompt: 'relaciona Alumno con Curso muchos a muchos',
        currentNodes,
      });
      expect(result.success).toBe(true);
      expect(result.nodes.find((n) => n.id === 'a')?.position).toEqual({
        x: 100,
        y: 50,
      });
      expect(result.nodes.every((n) => typeof n.position.x === 'number')).toBe(
        true,
      );
    });
  });

  describe('canal del equipo', () => {
    const twoDiagrams = [
      { id: 'diag-123', name: 'Ventas', classNames: ['Cliente', 'Pedido'] },
      { id: 'diag-456', name: 'Inventario', classNames: ['Producto'] },
    ];
    const answer = () =>
      mockModelResponse(
        JSON.stringify({ reply: 'Ana, ok', intent: 'answer', operations: [] }),
      );
    const addPago = () =>
      mockModelResponse(
        JSON.stringify({
          reply: 'Ana, creé Pago.',
          intent: 'edit',
          changesSummary: 'Clase Pago',
          operations: [
            {
              op: 'add_class',
              name: 'Pago',
              attributes: [{ name: 'id', type: 'UUID' }],
              methods: [],
            },
          ],
        }),
      );

    describe('crear diagramas', () => {
      const ask = async (text: string, extra: object = {}) =>
        (
          await service.submitMessage(
            'proj-1',
            { channel: 'direct', text, ...extra },
            ana,
          )
        ).result;

      it('crea el diagrama y diseña su contenido aunque haya otro abierto', async () => {
        addPago();
        const response = await ask(
          'crea un nuevo diagrama para un e-commerce',
          {
            activeDiagramId: 'diag-123',
            currentNodes: [],
            currentConnections: [],
          },
        );

        expect(diagrams.create).toHaveBeenCalledWith(
          { projectId: 'proj-1', name: 'E-commerce' },
          'user-1',
        );
        expect(diagrams.saveAst.mock.calls[0][0]).toBe('diag-new');
        expect(aiProvider.generate.mock.calls[0][0].parts[0].text).toContain(
          'YA CREÓ el diagrama vacío #E-commerce',
        );
        expect(response).toMatchObject({
          action: 'diagram_mutated',
          assistantMessage: {
            diagramId: 'diag-new',
            diagramName: 'E-commerce',
            text: expect.stringContaining('creé #E-commerce'),
          },
        });
        expect(collaborationGateway.emitToProject).toHaveBeenCalledWith(
          'proj-1',
          'diagram_activity',
          expect.objectContaining({ diagramId: 'diag-new' }),
        );
      });

      it('el texto no depende del modelo si este dice que no puede', async () => {
        mockModelResponse(
          JSON.stringify({
            reply: 'Ana, no puedo crear un nuevo diagrama.',
            intent: 'answer',
            operations: [],
          }),
        );
        const response = await ask('crea un diagrama para una clínica');
        expect(response?.message).toContain('creé #Clínica');
        expect(response?.message).not.toContain('no puedo');
      });

      it('crea vacío sin llamar al modelo si no dice de qué trata', async () => {
        const response = await ask('crea un diagrama nuevo');
        expect(aiProvider.generate).not.toHaveBeenCalled();
        expect(response?.assistantMessage).toMatchObject({
          diagramId: 'diag-new',
          text: expect.stringContaining('#Nuevo-diagrama'),
        });
      });

      it('no repite un nombre del proyecto', async () => {
        await ask('crea otro diagrama llamado Ventas');
        expect(diagrams.create.mock.calls[0][0].name).toBe('Ventas 2');
      });

      it('sin permiso de edición no crea nada', async () => {
        const response = await ask('crea un diagrama nuevo', {
          readOnly: true,
        });
        expect(diagrams.create).not.toHaveBeenCalled();
        expect(response?.success).toBe(false);
      });

      it('en modo «solo explicar» no crea nada', async () => {
        configure({ delivery: 'explain' });
        const response = await ask('crea un diagrama para un hotel');
        expect(diagrams.create).not.toHaveBeenCalled();
        expect(response?.message).toContain('solo explico');
      });

      it('en modo «proponer» crea el lienzo y deja el contenido como propuesta', async () => {
        configure({ delivery: 'propose' });
        addPago();
        const response = await ask('crea un diagrama para un hotel');
        expect(diagrams.create).toHaveBeenCalled();
        expect(diagrams.saveAst).not.toHaveBeenCalled();
        expect(response).toMatchObject({
          action: 'proposal',
          assistantMessage: { diagramId: 'diag-new' },
        });
      });

      it('«arma el diagrama de ventas» usa el que ya existe', async () => {
        answer();
        await ask('arma el diagrama de ventas');
        expect(diagrams.create).not.toHaveBeenCalled();
      });
    });

    it('un mensaje entre personas se comparte con el equipo sin llamar a Trazo', async () => {
      const { message, result } = await service.submitMessage(
        'proj-1',
        {
          channel: 'team',
          text: 'Luis, ¿revisas Pedido?',
          mentions: ['user-2'],
        },
        ana,
      );
      expect(result).toBeUndefined();
      expect(aiProvider.generate).not.toHaveBeenCalled();
      expect(message).toMatchObject({ mentions: ['user-2'] });
      expect(collaborationGateway.emitToProject).toHaveBeenCalledWith(
        'proj-1',
        'chat_message',
        expect.objectContaining({ text: 'Luis, ¿revisas Pedido?' }),
      );
    });

    it('Trazo responde en el canal cuando lo mencionan con @Trazo', async () => {
      answer();
      const { message, result } = await service.submitMessage(
        'proj-1',
        { channel: 'team', text: '@Trazo ¿qué es una composición?' },
        ana,
      );
      expect(message.mentions).toEqual(['ai_assistant']);
      await expect(result).resolves.toMatchObject({ action: 'answer' });
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text;
      expect(sent).toContain('DÓNDE: canal del equipo');
      expect(collaborationGateway.emitToProject).toHaveBeenCalledWith(
        'proj-1',
        'trazo_status',
        expect.objectContaining({ busy: true, userName: 'Ana Pérez' }),
      );
    });

    it('trabaja en el diagrama marcado con # aunque nadie lo tenga abierto y lo guarda', async () => {
      access.listProjectDiagrams.mockResolvedValue(twoDiagrams);
      diagrams.findOne.mockResolvedValue({
        nodes: [
          {
            id: 'p',
            name: 'Producto',
            positionX: 10,
            positionY: 20,
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
      });
      addPago();

      const { result } = await service.submitMessage(
        'proj-1',
        {
          channel: 'team',
          text: '@Trazo agrega la clase Pago en #Inventario',
          activeDiagramId: 'diag-123',
        },
        ana,
      );
      const response = await result;

      expect(diagrams.findOne).toHaveBeenCalledWith('diag-456', 'user-1');
      expect(response?.nodes.map((n) => n.name)).toEqual(['Producto', 'Pago']);
      expect(diagrams.saveAst).toHaveBeenCalledWith(
        'diag-456',
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ name: 'Producto', positionX: 10 }),
          ]),
        }),
        'user-1',
        // El aviso al proyecto dice que lo cambió Trazo a pedido de Ana
        {
          userId: 'ai_assistant',
          userName: 'Trazo (a pedido de Ana)',
          onBehalfOf: { userId: 'user-1', userName: 'Ana Pérez' },
        },
      );
      expect(collaborationGateway.broadcastAiMutation).toHaveBeenCalledWith(
        'diag-456',
        expect.any(Array),
        expect.any(Array),
      );
      expect(response?.assistantMessage).toMatchObject({
        diagramId: 'diag-456',
        diagramName: 'Inventario',
      });
    });

    it('deduce el diagrama por las clases que menciona el mensaje', async () => {
      access.listProjectDiagrams.mockResolvedValue(twoDiagrams);
      answer();
      await (
        await service.submitMessage(
          'proj-1',
          { channel: 'team', text: '@Trazo ¿Producto necesita un precio?' },
          ana,
        )
      ).result;
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text;
      expect(sent).toContain(
        'LIENZO: #Inventario (es el único diagrama con las clases que menciona)',
      );
    });

    it('pregunta en qué diagrama si no puede deducirlo y no guarda nada', async () => {
      access.listProjectDiagrams.mockResolvedValue(twoDiagrams);
      addPago();
      const response = await (
        await service.submitMessage(
          'proj-1',
          { channel: 'team', text: '@Trazo agrega una clase Pago' },
          ana,
        )
      ).result;

      expect(response?.action).toBe('clarification_required');
      expect(response?.message).toBe(
        'Ana, ¿en qué diagrama lo hago? Indícalo con #: #Ventas, #Inventario.',
      );
      expect(diagrams.saveAst).not.toHaveBeenCalled();
      expect(collaborationGateway.broadcastAiMutation).not.toHaveBeenCalled();
    });

    const luisWork = (minutesAgo: number) => ({
      diagramId: 'diag-456',
      diagramName: 'Inventario',
      actor: { userId: 'user-2', userName: 'Luis Rojas' },
      summary: 'creó la clase Lote (id: UUID, vence: LocalDate)',
      updatedAt: new Date(Date.now() - minutesAgo * 60_000),
    });

    it('revisa lo que hizo una persona en el lienzo donde trabajó', async () => {
      access.listProjectDiagrams.mockResolvedValue(twoDiagrams);
      activity.recent.mockResolvedValue([luisWork(25)]);
      answer();
      await (
        await service.submitMessage(
          'proj-1',
          {
            channel: 'team',
            text: '@Trazo revisa lo que hizo Luis',
            activeDiagramId: 'diag-123',
          },
          ana,
        )
      ).result;

      expect(activity.recent).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ userIds: ['user-2'] }),
      );
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text;
      expect(sent).toContain('ACTIVIDAD EN LOS LIENZOS (trabajo de Luis Rojas');
      expect(sent).toContain(
        '- hace 25 min, Luis Rojas en #Inventario: creó la clase Lote',
      );
      // Aunque Ana tiene abierto Ventas, la revisión es sobre el lienzo de Luis
      expect(sent).toContain(
        'LIENZO: #Inventario (es donde trabajó la persona de la que se habla)',
      );
    });

    it('pone al día con lo que pasó desde la última conexión', async () => {
      const lastSeen = new Date(Date.now() - 3 * 60 * 60_000);
      activity.lastSeen.mockResolvedValue(lastSeen);
      activity.recent.mockResolvedValue([luisWork(60)]);
      answer();
      await (
        await service.submitMessage(
          'proj-1',
          { channel: 'direct', text: '¿qué han avanzado?' },
          ana,
        )
      ).result;

      expect(activity.lastSeen).toHaveBeenCalledWith('proj-1', 'user-1');
      expect(activity.recent).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ since: lastSeen }),
      );
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text;
      expect(sent).toContain(
        'ACTIVIDAD EN LOS LIENZOS (desde la última conexión de Ana Pérez, hace 3 h',
      );
    });

    it('sin actividad reciente no añade la sección al prompt', async () => {
      answer();
      await (
        await service.submitMessage(
          'proj-1',
          { channel: 'team', text: '@Trazo ¿qué es una composición?' },
          ana,
        )
      ).result;
      const sent = aiProvider.generate.mock.calls[0][0].parts[0].text;
      expect(sent).not.toContain('ACTIVIDAD EN LOS LIENZOS');
    });

    it('solo el administrador puede reiniciar el canal del equipo', async () => {
      await expect(
        service.startConversation('proj-1', 'team', ana),
      ).rejects.toThrow(ForbiddenException);

      access.assertProjectAccess.mockResolvedValueOnce('OWNER');
      await expect(
        service.startConversation('proj-1', 'team', ana),
      ).resolves.toMatchObject({ channel: 'team' });
    });
  });

  describe('resolveManyToManyRelationships', () => {
    it('no convierte en clase el verbo de la relación', () => {
      const node = (id: string, name: string) => ({
        id,
        name,
        position: { x: 0, y: 0 },
        attributes: [],
        methods: [],
      });
      const { nodes } = resolveManyToManyRelationships(
        [node('n1', 'Pedido'), node('n2', 'Producto')] as any,
        [
          {
            id: 'conn_1',
            sourceNodeId: 'n1',
            targetNodeId: 'n2',
            type: 'association',
            name: 'contiene',
            sourceMultiplicity: '*',
            targetMultiplicity: '*',
          },
        ] as any,
      );
      const names = nodes.map((n) => n.name);
      expect(names).toContain('Pedido_Producto');
      expect(names).not.toContain('contiene');
    });

    it('debe generar tabla intermedia para multiplicidades *, 0..*, 1..* y n sin alterar relaciones 1 a muchos', () => {
      const nodes = [
        {
          id: 'n1',
          name: 'Alumno',
          position: { x: 100, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'n2',
          name: 'Materia',
          position: { x: 500, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'n3',
          name: 'Profesor',
          position: { x: 100, y: 400 },
          attributes: [],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_1',
          sourceNodeId: 'n1',
          targetNodeId: 'n2',
          sourceId: 'n1_right',
          targetId: 'n2_left',
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1..*',
        },
        {
          id: 'conn_2',
          sourceNodeId: 'n3',
          targetNodeId: 'n2',
          sourceId: 'n3_right',
          targetId: 'n2_bottom',
          type: 'association',
          sourceMultiplicity: '1',
          targetMultiplicity: '*',
        },
      ];

      const res = resolveManyToManyRelationships(nodes, connections);

      expect(res.resolvedCount).toBe(1);
      // conn_1 se resuelve con tabla intermedia (Alumno_Materia) y ancla
      expect(res.nodes).toHaveLength(5); // 3 originales + 1 ancla + 1 Alumno_Materia
      const assoc = res.nodes.find((n) => n.name === 'Alumno_Materia');
      expect(assoc).toBeDefined();

      // conn_2 (1 a *) permanece intacta sin ancla ni tabla intermedia adicional
      const conn2 = res.connections.find((c) => c.id === 'conn_2');
      expect(conn2?.assocAnchorNodeId).toBeUndefined();
    });

    it('no debe duplicar la tabla asociativa si Gemini ya extrajo o generó una tabla intermedia (ej: OrderProduct)', () => {
      const nodes = [
        {
          id: 'node_order',
          name: 'Order',
          position: { x: 100, y: 100 },
          attributes: [{ name: 'order_id', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_product',
          name: 'Products',
          position: { x: 600, y: 100 },
          attributes: [{ name: 'product_id', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_order_product',
          name: 'OrderProduct',
          position: { x: 350, y: 300 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'orderId', type: 'UUID' },
            { name: 'productId', type: 'UUID' },
            { name: 'quantity', type: 'Integer' },
          ],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_m_n',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_product',
          sourceId: 'node_order_right',
          targetId: 'node_product_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      const res = resolveManyToManyRelationships(nodes, connections);

      // No debe haber creado 'Order_Products', debe haber reutilizado 'OrderProduct'
      const intermediateTables = res.nodes.filter(
        (n) =>
          !n.isAnchor &&
          n.name.toLowerCase().includes('order') &&
          n.name.toLowerCase().includes('product'),
      );
      expect(intermediateTables).toHaveLength(1);
      expect(intermediateTables[0].name).toBe('OrderProduct');
      expect(intermediateTables[0].assocMainConnId).toBe('conn_m_n');
      // Debe contener ÚNICAMENTE los 2 IDs foráneos, sin atributo 'id' artificial ni 'quantity'
      expect(intermediateTables[0].attributes).toEqual([
        { name: 'orderId', type: 'UUID' },
        { name: 'productId', type: 'UUID' },
      ]);
      expect(intermediateTables[0].methods).toEqual([]);

      // Debe haber generado el ancla virtual y el conector «link» hacia OrderProduct
      const anchor = res.nodes.find((n) => n.isAnchor);
      expect(anchor).toBeDefined();

      const linkConn = res.connections.find(
        (c) => c.type === 'association_class',
      );
      expect(linkConn).toBeDefined();
      expect(linkConn?.sourceNodeId).toBe(anchor?.id);
      expect(linkConn?.targetNodeId).toBe('node_order_product');
      expect(linkConn?.name).toBe('«link»');
    });

    it('debe generar en la tabla intermedia sintetizada ÚNICAMENTE los 2 IDs foráneos y nunca id artificial ni fechaRegistro', () => {
      const nodes = [
        {
          id: 'node_estudiante',
          name: 'Estudiante',
          position: { x: 100, y: 100 },
          attributes: [{ name: 'codigo', type: 'String' }],
          methods: [],
        },
        {
          id: 'node_curso',
          name: 'Curso',
          position: { x: 600, y: 100 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_m_n',
          sourceNodeId: 'node_estudiante',
          targetNodeId: 'node_curso',
          sourceId: 'node_estudiante_right',
          targetId: 'node_curso_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      const res = resolveManyToManyRelationships(nodes, connections);

      const intermediate = res.nodes.find(
        (n) => n.assocMainConnId === 'conn_m_n',
      );
      expect(intermediate).toBeDefined();
      // Debe tener exactamente 2 atributos correspondientes a las FKs
      expect(intermediate?.attributes).toEqual([
        { name: 'estudianteId', type: 'String' },
        { name: 'cursoId', type: 'UUID' },
      ]);
      expect(
        intermediate?.attributes.some((a) => a.name.toLowerCase() === 'id'),
      ).toBe(false);
      expect(
        intermediate?.attributes.some((a) => a.name === 'fechaRegistro'),
      ).toBe(false);
      expect(intermediate?.methods).toEqual([]);
    });

    it('debe podar tablas intermedias duplicadas redundantes manteniendo la entidad con más atributos de dominio', () => {
      const nodes = [
        {
          id: 'node_order',
          name: 'Order',
          position: { x: 100, y: 100 },
          attributes: [],
          methods: [],
        },
        {
          id: 'node_product',
          name: 'Products',
          position: { x: 600, y: 100 },
          attributes: [],
          methods: [],
        },
        // Tabla real con atributos de dominio
        {
          id: 'node_order_product_real',
          name: 'OrderProduct',
          position: { x: 350, y: 50 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'orderId', type: 'UUID' },
            { name: 'productId', type: 'UUID' },
            { name: 'quantity', type: 'Integer' },
          ],
          methods: [],
        },
        // Stub autogenerado duplicado
        {
          id: 'node_order_products_stub',
          name: 'Order_Products',
          position: { x: 350, y: 350 },
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'fechaRegistro', type: 'LocalDateTime' },
          ],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_m_n',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_product',
          sourceId: 'node_order_right',
          targetId: 'node_product_left',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ];

      const res = resolveManyToManyRelationships(nodes, connections);

      // Debe conservar únicamente OrderProduct y eliminar Order_Products
      const remainingAssoc = res.nodes.filter(
        (n) =>
          !n.isAnchor &&
          (n.name === 'OrderProduct' || n.name === 'Order_Products'),
      );
      expect(remainingAssoc).toHaveLength(1);
      expect(remainingAssoc[0].id).toBe('node_order_product_real');
      expect(
        res.nodes.find((n) => n.id === 'node_order_products_stub'),
      ).toBeUndefined();
    });

    it('debe preservar intactas todas las demás tablas y relaciones (Customer, Delivery, Categories) al resolver la relación M:N', () => {
      const nodes = [
        {
          id: 'node_customer',
          name: 'Customer',
          position: { x: 50, y: 50 },
          attributes: [{ name: 'customer_ID', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_order',
          name: 'Order',
          position: { x: 300, y: 50 },
          attributes: [{ name: 'order_ID', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_delivery',
          name: 'Delivery',
          position: { x: 300, y: 350 },
          attributes: [{ name: 'delivery_ID', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_products',
          name: 'Products',
          position: { x: 600, y: 50 },
          attributes: [{ name: 'product_ID', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_categories',
          name: 'Categories',
          position: { x: 850, y: 50 },
          attributes: [{ name: 'category_ID', type: 'UUID' }],
          methods: [],
        },
        {
          id: 'node_order_product',
          name: 'OrderProduct',
          position: { x: 450, y: 200 },
          attributes: [{ name: 'id', type: 'UUID' }],
          methods: [],
        },
      ];

      const connections = [
        {
          id: 'conn_cust_order',
          sourceNodeId: 'node_customer',
          targetNodeId: 'node_order',
          type: 'association',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
        {
          id: 'conn_order_deliv',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_delivery',
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1',
        },
        {
          id: 'conn_order_prod_mn',
          sourceNodeId: 'node_order',
          targetNodeId: 'node_products',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
        {
          id: 'conn_prod_cat',
          sourceNodeId: 'node_products',
          targetNodeId: 'node_categories',
          type: 'association',
          sourceMultiplicity: '0..*',
          targetMultiplicity: '1',
        },
      ];

      const res = resolveManyToManyRelationships(nodes, connections);

      // Todas las 5 tablas de dominio originales deben estar presentes
      expect(res.nodes.find((n) => n.id === 'node_customer')).toBeDefined();
      expect(res.nodes.find((n) => n.id === 'node_order')).toBeDefined();
      expect(res.nodes.find((n) => n.id === 'node_delivery')).toBeDefined();
      expect(res.nodes.find((n) => n.id === 'node_products')).toBeDefined();
      expect(res.nodes.find((n) => n.id === 'node_categories')).toBeDefined();
      expect(
        res.nodes.find((n) => n.id === 'node_order_product'),
      ).toBeDefined();

      // Todas las conexiones 1:N originales deben seguir intactas
      expect(
        res.connections.find((c) => c.id === 'conn_cust_order'),
      ).toBeDefined();
      expect(
        res.connections.find((c) => c.id === 'conn_order_deliv'),
      ).toBeDefined();
      expect(
        res.connections.find((c) => c.id === 'conn_prod_cat'),
      ).toBeDefined();

      // La relación M:N debe tener su ancla y enlace «link»
      const mainMn = res.connections.find((c) => c.id === 'conn_order_prod_mn');
      expect(mainMn?.assocAnchorNodeId).toBeDefined();

      const linkConn = res.connections.find(
        (c) => c.type === 'association_class',
      );
      expect(linkConn).toBeDefined();
      expect(linkConn?.targetNodeId).toBe('node_order_product');
    });
  });
});
