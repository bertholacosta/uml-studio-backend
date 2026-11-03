import { Test, TestingModule } from '@nestjs/testing';
import { XmiInteropService, withFreshIds } from './xmi-interop.service';
import { XmiExporterService } from './xmi-exporter.service';
import { XmiParserService } from './xmi-parser.service';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { DiagramService } from '../../diagrams/services/diagram.service';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { ProjectRole } from '../../projects/entities/project-role.enum';

describe('XmiInteropService', () => {
  let service: XmiInteropService;
  let diagramRepo: jest.Mocked<DiagramRepository>;
  let diagramService: jest.Mocked<DiagramService>;
  let access: {
    assertDiagramAccess: jest.Mock;
    assertProjectAccess: jest.Mock;
  };

  beforeEach(async () => {
    const mockDiagramRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'diag-1',
        projectId: 'proj-1',
        name: 'Diagrama Ventas',
        nodes: [
          {
            id: 'n1',
            name: 'Cliente',
            positionX: 100,
            positionY: 100,
            width: 220,
            height: 120,
            attributes: [],
            methods: [],
          },
        ],
        connections: [],
      }),
      create: jest.fn().mockImplementation((d) => ({ ...d, id: 'diag-new' })),
      save: jest
        .fn()
        .mockImplementation((d) => Promise.resolve({ ...d, id: 'diag-new' })),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const mockDiagramService = {
      saveAst: jest.fn().mockResolvedValue({ id: 'diag-1' } as any),
      create: jest.fn().mockResolvedValue({ id: 'diag-new' } as any),
    };

    access = {
      assertDiagramAccess: jest.fn().mockResolvedValue(ProjectRole.OWNER),
      assertProjectAccess: jest.fn().mockResolvedValue(ProjectRole.OWNER),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XmiInteropService,
        XmiExporterService,
        XmiParserService,
        { provide: DiagramRepository, useValue: mockDiagramRepo },
        { provide: DiagramService, useValue: mockDiagramService },
        { provide: ProjectAccessService, useValue: access },
      ],
    }).compile();

    service = module.get<XmiInteropService>(XmiInteropService);
    diagramRepo = module.get(DiagramRepository);
    diagramService = module.get(DiagramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should export diagram from DB to XMI', async () => {
    const res = await service.exportDiagramToXmi('diag-1', 'u1');
    expect(res).toBeDefined();
    expect(res.filename).toContain('diagrama_ventas_ea.xmi');
    expect(res.xmiContent).toContain('<xmi:XMI');
    expect(res.xmiContent).toContain('name="Cliente"');
    expect(access.assertDiagramAccess).toHaveBeenCalledWith(
      'diag-1',
      'u1',
      'read',
    );
  });

  it('importar sobre un diagrama exige permiso de escritura antes de guardar', async () => {
    const xmi = (await service.exportDiagramToXmi('diag-1', 'u1')).xmiContent;
    access.assertDiagramAccess.mockRejectedValueOnce(new Error('403'));
    await expect(
      service.importXmi({ xmiContent: xmi, diagramId: 'diag-1' } as any, 'u1'),
    ).rejects.toThrow('403');
    expect(diagramService.saveAst).not.toHaveBeenCalled();
  });
  it('importa dos veces el mismo XMI con ids distintos y renombra solo tras guardar', async () => {
    const xmi = (await service.exportDiagramToXmi('diag-1', 'u1')).xmiContent;
    await service.importXmi(
      { xmiContent: xmi, projectId: 'proj-1' } as any,
      'u1',
    );
    await service.importXmi(
      { xmiContent: xmi, projectId: 'proj-1' } as any,
      'u1',
    );
    const [first, second] = diagramService.saveAst.mock.calls.map((c) =>
      c[1].nodes.map((n) => n.id),
    );
    expect(first).toHaveLength(1);
    expect(first[0]).not.toBe(second[0]);
  });

  it('si falla el guardado de una importación nueva, borra el diagrama creado', async () => {
    const xmi = (await service.exportDiagramToXmi('diag-1', 'u1')).xmiContent;
    diagramService.saveAst.mockRejectedValueOnce(new Error('db'));
    await expect(
      service.importXmi({ xmiContent: xmi, projectId: 'proj-1' } as any, 'u1'),
    ).rejects.toThrow('db');
    expect(diagramRepo.delete).toHaveBeenCalledWith('diag-new');
  });

  it('si falla la reimportación, no renombra el diagrama', async () => {
    const xmi = (await service.exportDiagramToXmi('diag-1', 'u1')).xmiContent;
    diagramService.saveAst.mockRejectedValueOnce(new Error('db'));
    await expect(
      service.importXmi({ xmiContent: xmi, diagramId: 'diag-1' } as any, 'u1'),
    ).rejects.toThrow('db');
    expect(diagramRepo.update).not.toHaveBeenCalled();
  });
});

describe('withFreshIds', () => {
  it('renueva ids y mantiene coherentes todas las referencias', () => {
    const res = withFreshIds({
      name: 'D',
      nodes: [
        {
          id: 'A',
          name: 'Alumno',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
        },
        {
          id: 'C',
          name: 'Curso',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
        },
        {
          id: 'X',
          name: '',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
          isAnchor: true,
        },
        {
          id: 'AC',
          name: 'AlumnoCurso',
          position: { x: 0, y: 0 },
          attributes: [],
          methods: [],
          assocMainConnId: 'r',
        },
      ],
      connections: [
        {
          id: 'r',
          sourceNodeId: 'A',
          targetNodeId: 'C',
          sourceId: 'A_right',
          targetId: 'C_left',
          type: 'association',
          assocAnchorNodeId: 'X',
        },
        {
          id: 'l',
          sourceNodeId: 'X',
          targetNodeId: 'AC',
          sourceId: 'X',
          targetId: 'AC_top',
          type: 'association_class',
        },
      ],
    } as any);
    const id = (name: string) => res.nodes.find((n) => n.name === name)!.id;
    const [main, link] = res.connections;
    expect(res.nodes.map((n) => n.id)).not.toContain('A');
    expect(main).toMatchObject({
      sourceNodeId: id('Alumno'),
      sourceId: `${id('Alumno')}_right`,
      targetId: `${id('Curso')}_left`,
    });
    expect(main.assocAnchorNodeId).toBe(id(''));
    expect(link).toMatchObject({
      sourceId: id(''),
      targetId: `${id('AlumnoCurso')}_top`,
    });
    expect(
      res.nodes.find((n) => n.name === 'AlumnoCurso')!.assocMainConnId,
    ).toBe(main.id);
  });
});
