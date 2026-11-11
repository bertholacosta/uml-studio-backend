import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ANNOUNCE_INTERVAL_MS, DiagramService } from './diagram.service';
import { DiagramRepository } from '../repositories/diagram.repository';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { CollaborationGateway } from '../../projects/gateways/collaboration.gateway';
import { ActivityService } from '../../activity/activity.service';
import { ProjectRole } from '../../projects/entities/project-role.enum';
import { Diagram } from '../entities/diagram.entity';
import { UmlNode } from '../entities/uml-node.entity';
import { UmlAttribute } from '../entities/uml-attribute.entity';
import { UmlMethod } from '../entities/uml-method.entity';
import { UmlConnection } from '../entities/uml-connection.entity';

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';

describe('DiagramService', () => {
  let service: DiagramService;
  let diagramRepo: jest.Mocked<Partial<DiagramRepository>>;
  let access: {
    assertDiagramAccess: jest.Mock;
    assertProjectAccess: jest.Mock;
    getUserName: jest.Mock;
    listProjectDiagrams: jest.Mock;
  };
  let manager: { delete: jest.Mock; insert: jest.Mock; update: jest.Mock };
  let gateway: { emitToProject: jest.Mock };
  let activity: { prime: jest.Mock; record: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '22222222-2222-2222-2222-222222222222';
  const mockDiagramId = '33333333-3333-3333-3333-333333333333';

  const mockDiagram = {
    id: mockDiagramId,
    projectId: mockProjectId,
    name: 'Main Class Diagram',
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    nodes: [
      {
        id: 'node_1',
        diagramId: mockDiagramId,
        name: 'Usuario',
        positionX: 100,
        positionY: 200,
        width: 220,
        height: 150,
        isAnchor: false,
        assocMainConnId: null,
        attributes: [
          {
            id: 'attr_1',
            nodeId: 'node_1',
            name: 'id',
            type: 'UUID',
            orderIndex: 0,
          },
        ],
        methods: [],
      },
    ],
    connections: [],
  } as unknown as Diagram;

  beforeEach(async () => {
    diagramRepo = {
      create: jest.fn().mockImplementation((data) => ({ ...data }) as Diagram),
      save: jest.fn().mockImplementation((d) =>
        Promise.resolve({
          ...d,
          id: mockDiagramId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findAllByProjectId: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(mockDiagram),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    access = {
      assertDiagramAccess: jest.fn().mockResolvedValue(ProjectRole.EDITOR),
      assertProjectAccess: jest.fn().mockResolvedValue(ProjectRole.EDITOR),
      getUserName: jest.fn().mockResolvedValue('Ana Pérez'),
      listProjectDiagrams: jest.fn().mockResolvedValue([]),
    };
    gateway = { emitToProject: jest.fn() };
    activity = {
      prime: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(null),
    };
    manager = {
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb: any) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiagramService,
        { provide: DiagramRepository, useValue: diagramRepo },
        { provide: ProjectAccessService, useValue: access },
        { provide: DataSource, useValue: dataSource },
        { provide: CollaborationGateway, useValue: gateway },
        { provide: ActivityService, useValue: activity },
      ],
    }).compile();

    service = module.get<DiagramService>(DiagramService);
  });

  describe('create', () => {
    it('crea un diagrama vacío sin volver a consultarlo', async () => {
      const result = await service.create(
        { projectId: mockProjectId, name: '  Nuevo  ' },
        mockUserId,
      );
      expect(access.assertProjectAccess).toHaveBeenCalledWith(
        mockProjectId,
        mockUserId,
        'write',
      );
      expect(result.name).toBe('Nuevo');
      expect(result.nodes).toEqual([]);
      expect(diagramRepo.findById).not.toHaveBeenCalled();
    });

    it('propaga el 403 de un VIEWER sin crear nada', async () => {
      access.assertProjectAccess.mockRejectedValueOnce(
        new ForbiddenException(),
      );
      await expect(
        service.create({ projectId: mockProjectId, name: 'X' }, mockUserId),
      ).rejects.toThrow(ForbiddenException);
      expect(diagramRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('devuelve el diagrama completo tras comprobar acceso de lectura', async () => {
      const result = await service.findOne(mockDiagramId, mockUserId);
      expect(access.assertDiagramAccess).toHaveBeenCalledWith(
        mockDiagramId,
        mockUserId,
        'read',
      );
      expect(result.nodes[0].name).toBe('Usuario');
    });

    it('propaga el 404 de un diagrama inexistente', async () => {
      access.assertDiagramAccess.mockRejectedValueOnce(new NotFoundException());
      await expect(service.findOne('x', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllByProjectId', () => {
    it('lista los diagramas con los nombres de sus clases, sin su contenido', async () => {
      diagramRepo.findAllByProjectId.mockResolvedValue([mockDiagram]);
      access.listProjectDiagrams.mockResolvedValue([
        {
          id: mockDiagramId,
          name: 'Ventas',
          classNames: ['Cliente', 'Pedido'],
        },
      ]);

      const [diagram] = await service.findAllByProjectId(
        mockProjectId,
        mockUserId,
      );
      expect(diagram.classNames).toEqual(['Cliente', 'Pedido']);
    });
  });

  describe('saveAst', () => {
    it('reemplaza el AST con una inserción en bloque por tabla', async () => {
      await service.saveAst(
        mockDiagramId,
        {
          nodes: [
            {
              id: 'n1',
              name: 'Usuario',
              positionX: 1,
              positionY: 2,
              attributes: [
                { name: 'id', type: 'UUID' },
                { name: 'email', type: 'String' },
              ],
              methods: [],
            },
            {
              id: 'n2',
              name: 'Rol',
              positionX: 3,
              positionY: 4,
              attributes: [
                { name: 'id', type: 'UUID', visibility: 'protected' },
              ],
              methods: [{ name: 'ok', returnType: 'void' }],
            },
          ],
          connections: [
            {
              id: 'c1',
              sourceNodeId: 'n1',
              targetNodeId: 'n2',
              sourceId: 'n1_right',
              targetId: 'n2_left',
              type: 'association',
              targetRole: ' roles ',
              navigability: 'to_target',
            },
          ],
        },
        mockUserId,
      );

      expect(access.assertDiagramAccess).toHaveBeenCalledWith(
        mockDiagramId,
        mockUserId,
        'write',
      );
      expect(manager.delete).toHaveBeenCalledWith(UmlNode, {
        diagramId: mockDiagramId,
      });
      // Se conoce el estado anterior antes de sobrescribirlo y se apunta quién cambió qué
      expect(activity.prime.mock.invocationCallOrder[0]).toBeLessThan(
        dataSource.transaction.mock.invocationCallOrder[0],
      );
      expect(activity.record).toHaveBeenCalledWith(
        mockDiagramId,
        { userId: mockUserId, userName: 'Ana Pérez' },
        expect.any(Array),
        expect.any(Array),
        undefined,
      );
      // El resto del proyecto (p. ej. la app móvil) se entera del cambio
      expect(gateway.emitToProject).toHaveBeenCalledWith(
        mockProjectId,
        'diagram_activity',
        expect.objectContaining({
          diagramId: mockDiagramId,
          userId: mockUserId,
          userName: 'Ana Pérez',
        }),
      );
      const inserted = (entity: unknown) =>
        manager.insert.mock.calls.find(([e]) => e === entity)?.[1];
      expect(inserted(UmlNode)).toHaveLength(2);
      expect(inserted(UmlAttribute)).toEqual([
        {
          nodeId: 'n1',
          name: 'id',
          type: 'UUID',
          visibility: 'private',
          orderIndex: 0,
        },
        {
          nodeId: 'n1',
          name: 'email',
          type: 'String',
          visibility: 'private',
          orderIndex: 1,
        },
        {
          nodeId: 'n2',
          name: 'id',
          type: 'UUID',
          visibility: 'protected',
          orderIndex: 0,
        },
      ]);
      expect(inserted(UmlMethod)).toEqual([
        {
          nodeId: 'n2',
          name: 'ok',
          parameters: '',
          returnType: 'void',
          visibility: 'public',
          orderIndex: 0,
        },
      ]);
      expect(inserted(UmlConnection)[0]).toMatchObject({
        id: 'c1',
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
        sourceRole: null,
        targetRole: 'roles',
        navigability: 'to_target',
      });
      expect(manager.insert).toHaveBeenCalledTimes(4);
    });

    it('acepta nodos ancla con nombre vacío y no inserta tablas vacías', async () => {
      await service.saveAst(
        mockDiagramId,
        {
          nodes: [
            {
              id: 'anchor_1',
              name: '',
              positionX: 0,
              positionY: 0,
              isAnchor: true,
              attributes: [],
              methods: [],
            },
          ],
          connections: [],
        },
        mockUserId,
      );
      expect(manager.insert).toHaveBeenCalledTimes(1);
      expect(manager.insert.mock.calls[0][1][0]).toMatchObject({
        id: 'anchor_1',
        name: '',
        width: 0,
        isAnchor: true,
      });
    });

    it('agrupa los avisos de guardados seguidos (autoguardado) en uno por intervalo', async () => {
      jest.useFakeTimers();
      try {
        const save = () =>
          service.saveAst(
            mockDiagramId,
            { nodes: [], connections: [] },
            mockUserId,
          );
        const announced = () =>
          gateway.emitToProject.mock.calls.filter(
            ([, event]) => event === 'diagram_activity',
          ).length;

        await save();
        expect(announced()).toBe(1); // el primero sale al momento
        await save();
        await save();
        expect(announced()).toBe(1);

        jest.advanceTimersByTime(ANNOUNCE_INTERVAL_MS);
        expect(announced()).toBe(2); // el último de la ráfaga, al cumplirse el intervalo

        await save();
        expect(announced()).toBe(2); // aún dentro del intervalo del aviso anterior
        jest.advanceTimersByTime(ANNOUNCE_INTERVAL_MS);
        expect(announced()).toBe(3);
        jest.advanceTimersByTime(ANNOUNCE_INTERVAL_MS);
        expect(announced()).toBe(3); // sin cambios nuevos no hay más avisos

        await save();
        expect(announced()).toBe(4); // tras un rato sin avisos, sale al momento
      } finally {
        service.onModuleDestroy();
        jest.useRealTimers();
      }
    });

    it('un VIEWER no puede guardar', async () => {
      access.assertDiagramAccess.mockRejectedValueOnce(
        new ForbiddenException(),
      );
      await expect(
        service.saveAst(
          mockDiagramId,
          { nodes: [], connections: [] },
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('debe validar exitosamente SaveDiagramAstDto cuando un nodo ancla tiene nombre vacío', async () => {
      const payload = {
        nodes: [
          {
            id: 'anchor_1789591684321',
            name: '',
            positionX: 300,
            positionY: 200,
            width: 0,
            height: 0,
            isAnchor: true,
            attributes: [],
            methods: [],
          },
          {
            id: 'node_normal',
            name: 'Tabla_7',
            positionX: 100,
            positionY: 100,
            width: 220,
            isAnchor: false,
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
      };

      const dto = plainToInstance(SaveDiagramAstDto, payload);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('debe fallar la validación si un nodo normal (isAnchor: false) tiene nombre vacío', async () => {
      const payload = {
        nodes: [
          {
            id: 'node_invalid',
            name: '',
            positionX: 100,
            positionY: 100,
            width: 220,
            isAnchor: false,
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
      };

      const dto = plainToInstance(SaveDiagramAstDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(JSON.stringify(errors)).toContain('name should not be empty');
    });
  });
});
