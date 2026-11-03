import { Test, TestingModule } from '@nestjs/testing';
import { DiagramController } from './diagram.controller';
import { DiagramService } from '../services/diagram.service';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';
import { User } from '../../auth/entities/user.entity';

describe('DiagramController', () => {
  let controller: DiagramController;
  let service: jest.Mocked<Partial<DiagramService>>;

  const mockUser: User = {
    id: '11111111-1111-1111-1111-111111111111',
    fullName: 'Usuario Demo',
    email: 'demo@example.com',
    passwordHash: 'hash',
    isActive: true,
    createdAt: new Date(),
    projectsCreated: [],
    projectMemberships: [],
  };

  const mockDiagramResponse: DiagramResponseDto = {
    id: '33333333-3333-3333-3333-333333333333',
    projectId: '22222222-2222-2222-2222-222222222222',
    name: 'Class Diagram',
    version: '1.0.0',
    nodes: [],
    connections: [],
    updatedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(mockDiagramResponse),
      findAllByProjectId: jest.fn().mockResolvedValue([mockDiagramResponse]),
      findOne: jest.fn().mockResolvedValue(mockDiagramResponse),
      saveAst: jest.fn().mockResolvedValue(mockDiagramResponse),
      update: jest.fn().mockResolvedValue(mockDiagramResponse),
      remove: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Deleted' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiagramController],
      providers: [{ provide: DiagramService, useValue: service }],
    }).compile();

    controller = module.get<DiagramController>(DiagramController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('debe crear un diagrama', async () => {
    const result = await controller.create(
      {
        projectId: '22222222-2222-2222-2222-222222222222',
        name: 'Class Diagram',
      },
      mockUser,
    );
    expect(service.create).toHaveBeenCalled();
    expect(result.id).toBe(mockDiagramResponse.id);
  });

  it('debe guardar el AST del diagrama', async () => {
    const result = await controller.saveAst(
      mockDiagramResponse.id,
      { nodes: [], connections: [] },
      mockUser,
    );
    expect(service.saveAst).toHaveBeenCalled();
    expect(result.id).toBe(mockDiagramResponse.id);
  });
});
