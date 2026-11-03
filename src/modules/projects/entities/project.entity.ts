import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { User } from '../../auth/entities/user.entity';
import type { ProjectMember } from './project-member.entity';
import type { Diagram } from '../../diagrams/entities/diagram.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    name: 'base_package',
    type: 'varchar',
    length: 150,
    default: 'com.example.app',
  })
  basePackage: string;

  @Column({ name: 'java_version', type: 'int', default: 21 })
  javaVersion: number;

  @Column({
    name: 'spring_boot_version',
    type: 'varchar',
    length: 20,
    default: '3.3.0',
  })
  springBootVersion: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne('User', (user: User) => user.projectsCreated, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany('ProjectMember', (member: ProjectMember) => member.project, {
    cascade: true,
  })
  members: ProjectMember[];

  @OneToMany('Diagram', (diagram: Diagram) => diagram.project, {
    cascade: true,
  })
  diagrams: Diagram[];
}
