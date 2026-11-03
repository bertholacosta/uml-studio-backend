import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectMemberService } from './project-member.service';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { ProjectRole } from '../entities/project-role.enum';
import { Project } from '../entities/project.entity';
import { ProjectMember } from '../entities/project-member.entity';
import { User } from '../../auth/entities/user.entity';

describe('ProjectMemberService', () => {
  let service: ProjectMemberService;
  let projectRepo: jest.Mocked<Partial<ProjectRepository>>;
  let memberRepo: jest.Mocked<Partial<ProjectMemberRepository>>;
  let userRepo: jest.Mocked<Partial<UserRepository>>;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockOtherUserId = '22222222-2222-2222-2222-222222222222';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';

  const mockUser: User = {
    id: mockUserId,
    fullName: 'Usuario Demo',
    email: 'demo@example.com',
    passwordHash: 'hash',
    isActive: true,
    createdAt: new Date(),
    projectsCreated: [],
    projectMemberships: [],
  };

  const mockProject: Project = {
    id: mockProjectId,
    name: 'Test Project',
    description: 'A test project description',
    basePackage: 'com.test.app',
    javaVersion: 21,
    springBootVersion: '3.3.0',
    createdBy: mockUserId,
    createdAt: new Date(),
    creator: mockUser,
    members: [],
    diagrams: [],
  };

  const mockMember: ProjectMember = {
    id: 'mem-1',
    projectId: mockProjectId,
    userId: mockOtherUserId,
    role: ProjectRole.EDITOR,
    joinedAt: new Date(),
    project: mockProject,
    user: {
      id: mockOtherUserId,
      fullName: 'Colaborador',
      email: 'colaborador@test.com',
    } as User,
  };

  beforeEach(async () => {
    projectRepo = {
      findById: jest.fn(),
    };

    memberRepo = {
      create: jest
        .fn()
        .mockImplementation(
          (data) => ({ ...data, id: 'mem-1' }) as ProjectMember,
        ),
      save: jest
        .fn()
        .mockImplementation((mem) =>
          Promise.resolve({ ...mem, id: 'mem-1' } as ProjectMember),
        ),
      findByProjectIdAndUserId: jest.fn(),
      findRole: jest.fn(),
      findByProjectId: jest.fn(),
      updateRole: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    userRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberService,
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: ProjectMemberRepository, useValue: memberRepo },
        { provide: UserRepository, useValue: userRepo },
      ],
    }).compile();

    service = module.get<ProjectMemberService>(ProjectMemberService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addMember', () => {
    it('debe agregar un nuevo miembro si el solicitante es OWNER', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);
      userRepo.findByEmail!.mockResolvedValue({
        id: mockOtherUserId,
        fullName: 'Otro Usuario',
        email: 'otro@uagrm.edu.bo',
      } as User);
      memberRepo.findByProjectIdAndUserId!.mockResolvedValue(null);
      memberRepo.create!.mockReturnValue({
        id: 'mem-2',
        projectId: mockProjectId,
        userId: mockOtherUserId,
        role: ProjectRole.EDITOR,
        joinedAt: new Date(),
        project: {} as any,
        user: {} as any,
      });
      memberRepo.save!.mockResolvedValue({
        id: 'mem-2',
        projectId: mockProjectId,
        userId: mockOtherUserId,
        role: ProjectRole.EDITOR,
        joinedAt: new Date(),
        project: {} as any,
        user: {} as any,
      });

      const result = await service.addMember(
        mockProjectId,
        { email: 'otro@uagrm.edu.bo', role: ProjectRole.EDITOR },
        mockUserId,
      );

      expect(memberRepo.create).toHaveBeenCalledWith({
        projectId: mockProjectId,
        userId: mockOtherUserId,
        role: ProjectRole.EDITOR,
      });
      expect(memberRepo.save).toHaveBeenCalled();
      expect(result.userId).toBe(mockOtherUserId);
    });

    it('debe lanzar ConflictException si el usuario ya es miembro', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);
      userRepo.findByEmail!.mockResolvedValue({
        id: mockOtherUserId,
        email: 'otro@uagrm.edu.bo',
      } as User);
      memberRepo.findByProjectIdAndUserId!.mockResolvedValue({
        id: 'mem-2',
      } as ProjectMember);

      await expect(
        service.addMember(
          mockProjectId,
          { email: 'otro@uagrm.edu.bo', role: ProjectRole.EDITOR },
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar ForbiddenException si el solicitante no es OWNER', async () => {
      projectRepo.findById!.mockResolvedValue({
        ...mockProject,
        createdBy: 'someone-else',
      } as Project);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.EDITOR);

      await expect(
        service.addMember(
          mockProjectId,
          { email: 'otro@uagrm.edu.bo', role: ProjectRole.EDITOR },
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateMemberRole', () => {
    it('debe actualizar el rol del miembro', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);
      memberRepo
        .findByProjectIdAndUserId!.mockResolvedValueOnce(mockMember)
        .mockResolvedValueOnce({ ...mockMember, role: ProjectRole.VIEWER });

      const result = await service.updateMemberRole(
        mockProjectId,
        mockOtherUserId,
        { role: ProjectRole.VIEWER },
        mockUserId,
      );

      expect(memberRepo.updateRole).toHaveBeenCalledWith(
        mockProjectId,
        mockOtherUserId,
        ProjectRole.VIEWER,
      );
      expect(result.role).toBe(ProjectRole.VIEWER);
    });

    it('debe lanzar BadRequestException si se intenta cambiar el rol del creador', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);

      await expect(
        service.updateMemberRole(
          mockProjectId,
          mockUserId,
          { role: ProjectRole.VIEWER },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeMember', () => {
    it('debe remover el miembro exitosamente si es OWNER', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);
      memberRepo.findByProjectIdAndUserId!.mockResolvedValue(mockMember);

      const result = await service.removeMember(
        mockProjectId,
        mockOtherUserId,
        mockUserId,
      );

      expect(memberRepo.delete).toHaveBeenCalledWith(
        mockProjectId,
        mockOtherUserId,
      );
      expect(result.success).toBe(true);
    });

    it('debe lanzar BadRequestException si el creador principal intenta abandonar el proyecto', async () => {
      projectRepo.findById!.mockResolvedValue(mockProject);
      memberRepo.findRole!.mockResolvedValue(ProjectRole.OWNER);

      await expect(
        service.removeMember(mockProjectId, mockUserId, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
