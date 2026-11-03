import { Test, TestingModule } from '@nestjs/testing';
import { CodeGeneratorController } from './code-generator.controller';
import { CodeGeneratorService } from '../services/code-generator.service';
import { User } from '../../auth/entities/user.entity';

describe('CodeGeneratorController', () => {
  let controller: CodeGeneratorController;
  let service: jest.Mocked<Partial<CodeGeneratorService>>;

  const mockUser: User = {
    id: 'user-111',
    fullName: 'Usuario Demo',
    email: 'demo@example.com',
    passwordHash: 'hash',
    isActive: true,
    createdAt: new Date(),
    projectsCreated: [],
    projectMemberships: [],
  };

  beforeEach(async () => {
    service = {
      previewFromDiagramId: jest.fn().mockResolvedValue({
        projectName: 'Tienda Online',
        totalFiles: 15,
        files: [],
      }),
      downloadZipFromDiagramId: jest.fn().mockResolvedValue({
        filename: 'tienda-online.zip',
        buffer: Buffer.from('mock-zip-content'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeGeneratorController],
      providers: [{ provide: CodeGeneratorService, useValue: service }],
    }).compile();

    controller = module.get<CodeGeneratorController>(CodeGeneratorController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe generar la vista previa de archivos a partir del ID del diagrama', async () => {
    const res = await controller.previewFromDiagramId(
      '11111111-1111-1111-1111-111111111111',
      {},
      mockUser,
    );
    expect(res.projectName).toBe('Tienda Online');
    expect(service.previewFromDiagramId).toHaveBeenCalled();
  });

  it('debe compilar y descargar el proyecto ZIP a partir del ID del diagrama', async () => {
    const mockRes = {
      set: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.downloadZipFromDiagramId(
      '11111111-1111-1111-1111-111111111111',
      {},
      mockUser,
      mockRes,
    );

    expect(service.downloadZipFromDiagramId).toHaveBeenCalled();
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="tienda-online.zip"',
      }),
    );
    expect(mockRes.send).toHaveBeenCalled();
  });
});
