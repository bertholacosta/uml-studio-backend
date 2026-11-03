import { Test, TestingModule } from '@nestjs/testing';
import { ProjectController } from './project.controller';
import { ProjectService } from '../services/project.service';
import { ProjectResponseDto } from '../dtos/project-response.dto';
import { ProjectRole } from '../entities/project-role.enum';
import { User } from '../../auth/entities/user.entity';

describe('ProjectController', () => {
  let controller: ProjectController;
  let service: jest.Mocked<Partial<ProjectService>>;

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

  const mockProjectResponse: ProjectResponseDto = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Test Project',
    description: 'Test Description',
    basePackage: 'com.example.app',
    javaVersion: 21,
    springBootVersion: '3.3.0',
    createdBy: mockUser.id,
    creatorName: mockUser.fullName,
    userRole: ProjectRole.OWNER,
    memberCount: 1,
    diagramCount: 1,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue(mockProjectResponse),
      findAllForUser: jest.fn().mockResolvedValue([mockProjectResponse]),
      findOne: jest.fn().mockResolvedValue(mockProjectResponse),
      update: jest
        .fn()
        .mockResolvedValue({ ...mockProjectResponse, name: 'Updated' }),
      remove: jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Deleted' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [{ provide: ProjectService, useValue: service }],
    }).compile();

    controller = module.get<ProjectController>(ProjectController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('debe crear un proyecto y retornar respuesta', async () => {
    const result = await controller.create({ name: 'Test Project' }, mockUser);
    expect(service.create).toHaveBeenCalledWith(
      { name: 'Test Project' },
      mockUser.id,
    );
    expect(result).toEqual(mockProjectResponse);
  });

  it('debe listar los proyectos del usuario', async () => {
    const result = await controller.findAll(mockUser);
    expect(service.findAllForUser).toHaveBeenCalledWith(mockUser.id);
    expect(result).toHaveLength(1);
  });

  it('debe obtener un proyecto por ID', async () => {
    const result = await controller.findOne(mockProjectResponse.id, mockUser);
    expect(service.findOne).toHaveBeenCalledWith(
      mockProjectResponse.id,
      mockUser.id,
    );
    expect(result).toEqual(mockProjectResponse);
  });

  it('debe actualizar un proyecto', async () => {
    const result = await controller.update(
      mockProjectResponse.id,
      { name: 'Updated' },
      mockUser,
    );
    expect(service.update).toHaveBeenCalledWith(
      mockProjectResponse.id,
      { name: 'Updated' },
      mockUser.id,
    );
    expect(result.name).toBe('Updated');
  });

  it('debe eliminar un proyecto', async () => {
    const result = await controller.remove(mockProjectResponse.id, mockUser);
    expect(service.remove).toHaveBeenCalledWith(
      mockProjectResponse.id,
      mockUser.id,
    );
    expect(result).toEqual({ success: true, message: 'Deleted' });
  });
});
