import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import type { Project } from './project.entity';
import type { User } from '../../auth/entities/user.entity';
import { ProjectRole } from './project-role.enum';

@Entity('project_members')
@Unique(['projectId', 'userId'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ProjectRole,
    default: ProjectRole.EDITOR,
  })
  role: ProjectRole;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamp' })
  joinedAt: Date;

  @ManyToOne('Project', (project: Project) => project.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne('User', (user: User) => user.projectMemberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
