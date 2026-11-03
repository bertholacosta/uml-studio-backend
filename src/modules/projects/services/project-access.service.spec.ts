import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProjectAccessService } from './project-access.service';
import { ProjectRole } from '../entities/project-role.enum';

describe('ProjectAccessService', () => {
  const query = jest.fn();
  const service = new ProjectAccessService({ query } as unknown as DataSource);
  const row = (
    role: ProjectRole | null,
    createdBy = 'otro',
    projectId: string | null = 'p1',
  ) => [{ project_id: projectId, created_by: createdBy, role }];

  beforeEach(() => query.mockReset());

  it('el creador del proyecto es siempre OWNER', async () => {
    query.mockResolvedValue(row(null, 'u1'));
    await expect(service.getProjectRole('p1', 'u1')).resolves.toBe(
      ProjectRole.OWNER,
    );
  });

  it('un diagrama sin proyecto no es accesible para nadie', async () => {
    query.mockResolvedValue(row(null, null, null));
    await expect(service.getDiagramAccessLevel('d1', 'u1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('un diagrama inexistente da 404', async () => {
    query.mockResolvedValue([]);
    await expect(
      service.assertDiagramAccess('d1', 'u1', 'read'),
    ).rejects.toThrow(NotFoundException);
  });

  it('quien no es miembro recibe 403', async () => {
    query.mockResolvedValue(row(null));
    await expect(
      service.assertDiagramAccess('d1', 'u1', 'read'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un VIEWER puede leer pero no escribir', async () => {
    query.mockResolvedValue(row(ProjectRole.VIEWER));
    await expect(service.getDiagramAccessLevel('d1', 'u1')).resolves.toBe(
      'read',
    );
    await expect(
      service.assertDiagramAccess('d1', 'u1', 'write'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un EDITOR puede escribir con una sola consulta', async () => {
    query.mockResolvedValue(row(ProjectRole.EDITOR));
    await expect(service.getDiagramAccessLevel('d1', 'u1')).resolves.toBe(
      'write',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
