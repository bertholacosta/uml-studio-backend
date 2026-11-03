import { Test, TestingModule } from '@nestjs/testing';
import { CodeGeneratorService } from './code-generator.service';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { SpringTemplateEngineService } from './spring-template-engine.service';
import { FlutterTemplateEngineService } from './flutter-template-engine.service';
import { ZipArchiverService } from './zip-archiver.service';
import { ProjectRole } from '../../projects/entities/project-role.enum';

describe('CodeGeneratorService', () => {
  let service: CodeGeneratorService;
  let diagramRepo: jest.Mocked<Partial<DiagramRepository>>;
  let access: { assertDiagramAccess: jest.Mock };

  const mockDiagram = {
    id: 'diag-111',
    projectId: 'proj-111',
    name: 'Tienda Online',
    nodes: [
      {
        id: 'node-1',
        name: 'Cliente',
        attributes: [
          { name: 'id', type: 'UUID' },
          { name: 'email', type: 'String' },
        ],
        methods: [],
      },
    ],
    connections: [],
  };

  beforeEach(async () => {
    diagramRepo = {
      findById: jest.fn().mockResolvedValue(mockDiagram as any),
    };
    access = {
      assertDiagramAccess: jest.fn().mockResolvedValue(ProjectRole.OWNER),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeGeneratorService,
        SpringTemplateEngineService,
        FlutterTemplateEngineService,
        ZipArchiverService,
        { provide: DiagramRepository, useValue: diagramRepo },
        { provide: ProjectAccessService, useValue: access },
      ],
    }).compile();

    service = module.get<CodeGeneratorService>(CodeGeneratorService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe generar vista previa a partir de un ID de diagrama', async () => {
    const preview = await service.previewFromDiagramId(
      'diag-111',
      {},
      'user-1',
    );
    expect(preview).toBeDefined();
    expect(preview.projectName).toBe('Tienda Online');
    expect(preview.files.length).toBeGreaterThan(5);
  });

  it('debe generar y empaquetar un archivo ZIP descargable', async () => {
    const zipResult = await service.downloadZipFromDiagramId(
      'diag-111',
      {},
      'user-1',
    );
    expect(zipResult).toBeDefined();
    expect(zipResult.filename).toContain('.zip');
    expect(zipResult.buffer).toBeInstanceOf(Buffer);
  }, 20000);
});
