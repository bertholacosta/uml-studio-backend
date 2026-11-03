import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMemberController } from './project-member.controller';
import { ProjectMemberService } from '../services/project-member.service';
import { ProjectMemberResponseDto } from '../dtos/project-member-response.dto';
import { ProjectRole } from '../entities/project-role.enum';
import { User } from '../../auth/entities/user.entity';

describe('ProjectMemberController', () => {
  let controller: ProjectMemberController;
  let service: jest.Mocked<Partial<ProjectMemberService>>;

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

  const mockMemberResponse: ProjectMemberResponseDto = {
    id: 'mem-1',
    userId: '22222222-2222-2222-2222-222222222222',
    fullName: 'Colaborador Test',
    email: 'colaborador@test.com',
    role: ProjectRole.EDITOR,
    joinedAt: new Date(),
  };

  const projectId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    service = {
      addMember: jest.fn().mockResolvedValue(mockMemberResponse),
      updateMemberRole: jest.fn().mockResolvedValue({
        ...mockMemberResponse,
        role: ProjectRole.VIEWER,
      }),
      removeMember: jest.fn().mockResolvedValue({
        success: true,
        message: 'Miembro removido exitosamente',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectMemberController],
      providers: [{ provide: ProjectMemberService, useValue: service }],
    }).compile();

    controller = module.get<ProjectMemberController>(ProjectMemberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('debe agregar/invitar un miembro al proyecto', async () => {
    const dto = { email: 'colaborador@test.com', role: ProjectRole.EDITOR };
    const result = await controller.addMember(projectId, dto, mockUser);
    expect(service.addMember).toHaveBeenCalledWith(projectId, dto, mockUser.id);
    expect(result).toEqual(mockMemberResponse);
  });

  it('debe actualizar el rol de un miembro colaborador', async () => {
    const dto = { role: ProjectRole.VIEWER };
    const result = await controller.updateMemberRole(
      projectId,
      mockMemberResponse.userId,
      dto,
      mockUser,
    );
    expect(service.updateMemberRole).toHaveBeenCalledWith(
      projectId,
      mockMemberResponse.userId,
      dto,
      mockUser.id,
    );
    expect(result.role).toBe(ProjectRole.VIEWER);
  });

  it('debe remover un miembro del proyecto', async () => {
    const result = await controller.removeMember(
      projectId,
      mockMemberResponse.userId,
      mockUser,
    );
    expect(service.removeMember).toHaveBeenCalledWith(
      projectId,
      mockMemberResponse.userId,
      mockUser.id,
    );
    expect(result).toEqual({
      success: true,
      message: 'Miembro removido exitosamente',
    });
  });
});
