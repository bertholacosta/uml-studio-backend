import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import type { Project } from '../../projects/entities/project.entity';
import type { ProjectMember } from '../../projects/entities/project-member.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @OneToMany('Project', (project: Project) => project.creator)
  projectsCreated: Project[];

  @OneToMany('ProjectMember', (member: ProjectMember) => member.user)
  projectMemberships: ProjectMember[];
}
