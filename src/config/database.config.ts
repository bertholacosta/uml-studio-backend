import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { User } from '../modules/auth/entities/user.entity';
import { Project } from '../modules/projects/entities/project.entity';
import { ProjectMember } from '../modules/projects/entities/project-member.entity';
import { Diagram } from '../modules/diagrams/entities/diagram.entity';
import { UmlNode } from '../modules/diagrams/entities/uml-node.entity';
import { UmlAttribute } from '../modules/diagrams/entities/uml-attribute.entity';
import { UmlMethod } from '../modules/diagrams/entities/uml-method.entity';
import { UmlConnection } from '../modules/diagrams/entities/uml-connection.entity';

export const ALL_ENTITIES = [
  User,
  Project,
  ProjectMember,
  Diagram,
  UmlNode,
  UmlAttribute,
  UmlMethod,
  UmlConnection,
];

export default registerAs('database', (): TypeOrmModuleOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  // DATABASE_URL (Render, Railway, Heroku...) tiene prioridad sobre las variables sueltas
  const connection = process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS,
        database: process.env.DB_NAME || 'uml_studio_db',
      };

  return {
    type: 'postgres',
    ...connection,
    entities: ALL_ENTITIES,
    // En producción el esquema se crea con schema.sql, salvo que se pida explícitamente
    synchronize: process.env.DB_SYNCHRONIZE
      ? process.env.DB_SYNCHRONIZE === 'true'
      : !isProduction,
    logging: process.env.DB_LOGGING === 'true',
    // La mayoría de Postgres gestionados exigen TLS
    ssl:
      process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
          }
        : false,
    extra: { max: parseInt(process.env.DB_POOL_SIZE || '10', 10) },
    retryAttempts: isProduction ? 10 : 3,
  };
});
