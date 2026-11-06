import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProjectRole } from '../entities/project-role.enum';

export type AccessLevel = 'read' | 'write';

export interface ProjectDiagramSummary {
  id: string;
  name: string;
  classNames: string[];
}

interface AccessRow {
  project_id: string | null;
  created_by: string | null;
  role: ProjectRole | null;
}

/**
 * Único punto de control de acceso a proyectos y diagramas.
 * Cada comprobación es una sola consulta ligera (sin cargar miembros, usuarios ni el AST).
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly dataSource: DataSource) {}

  /** Rol efectivo del usuario en el proyecto (el creador siempre es OWNER) o null si no es miembro. */
  async getProjectRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const [row] = await this.dataSource.query<AccessRow[]>(
      `SELECT p.id AS project_id, p.created_by, m.role
         FROM projects p
         LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = $2
        WHERE p.id = $1`,
      [projectId, userId],
    );
    if (!row) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return this.effectiveRole(row, userId);
  }

  async assertProjectAccess(
    projectId: string,
    userId: string,
    level: AccessLevel,
  ): Promise<ProjectRole> {
    return this.check(await this.getProjectRole(projectId, userId), level);
  }

  /** Nivel de acceso a un diagrama; lanza 404 si no existe y 403 si el usuario no es miembro. */
  async getDiagramAccessLevel(
    diagramId: string,
    userId: string,
  ): Promise<AccessLevel> {
    const role = await this.getDiagramRole(diagramId, userId);
    return this.check(role, 'read') === ProjectRole.VIEWER ? 'read' : 'write';
  }

  async assertDiagramAccess(
    diagramId: string,
    userId: string,
    level: AccessLevel,
  ): Promise<ProjectRole> {
    return this.check(await this.getDiagramRole(diagramId, userId), level);
  }

  /** Nombre del proyecto y del diagrama, para dar contexto a Trazo. */
  async getDiagramContext(diagramId: string): Promise<{
    projectId?: string;
    projectName?: string;
    diagramName?: string;
  }> {
    const [row] = await this.dataSource.query<
      { project_id: string; project_name: string; diagram_name: string }[]
    >(
      `SELECT d.project_id, p.name AS project_name, d.name AS diagram_name
         FROM diagrams d
         LEFT JOIN projects p ON p.id = d.project_id
        WHERE d.id = $1`,
      [diagramId],
    );
    return {
      projectId: row?.project_id || undefined,
      projectName: row?.project_name || undefined,
      diagramName: row?.diagram_name || undefined,
    };
  }

  /** Diagramas del proyecto con los nombres de sus clases: Trazo los usa para elegir lienzo. */
  async listProjectDiagrams(
    projectId: string,
  ): Promise<ProjectDiagramSummary[]> {
    const rows = await this.dataSource.query<
      { id: string; name: string; class_names: string[] | null }[]
    >(
      `SELECT d.id, d.name,
              array_remove(array_agg(n.name ORDER BY n.name)
                FILTER (WHERE n.is_anchor = false AND n.name <> ''), NULL) AS class_names
         FROM diagrams d
         LEFT JOIN uml_nodes n ON n.diagram_id = d.id
        WHERE d.project_id = $1
        GROUP BY d.id, d.name, d.created_at
        ORDER BY d.created_at`,
      [projectId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      classNames: row.class_names || [],
    }));
  }

  /** Nombre completo de una persona. */
  async getUserName(userId: string): Promise<string | undefined> {
    const [row] = await this.dataSource.query<{ full_name: string }[]>(
      'SELECT full_name FROM users WHERE id = $1',
      [userId],
    );
    return row?.full_name;
  }

  /** Nombre del proyecto. */
  async getProjectName(projectId: string): Promise<string | undefined> {
    const [row] = await this.dataSource.query<{ name: string }[]>(
      'SELECT name FROM projects WHERE id = $1',
      [projectId],
    );
    return row?.name;
  }

  private async getDiagramRole(
    diagramId: string,
    userId: string,
  ): Promise<ProjectRole | null> {
    const [row] = await this.dataSource.query<AccessRow[]>(
      `SELECT d.project_id, p.created_by, m.role
         FROM diagrams d
         LEFT JOIN projects p ON p.id = d.project_id
         LEFT JOIN project_members m ON m.project_id = d.project_id AND m.user_id = $2
        WHERE d.id = $1`,
      [diagramId, userId],
    );
    // Un diagrama sin proyecto no pertenece a nadie: no se expone
    if (!row?.project_id) {
      throw new NotFoundException('Diagrama no encontrado');
    }
    return this.effectiveRole(row, userId);
  }

  private effectiveRole(row: AccessRow, userId: string): ProjectRole | null {
    return row.created_by === userId ? ProjectRole.OWNER : row.role;
  }

  private check(role: ProjectRole | null, level: AccessLevel): ProjectRole {
    if (!role) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
    if (level === 'write' && role === ProjectRole.VIEWER) {
      throw new ForbiddenException(
        'Solo los editores y propietarios pueden modificar este proyecto',
      );
    }
    return role;
  }
}
