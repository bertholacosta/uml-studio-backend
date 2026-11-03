import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Diagram } from './entities/diagram.entity';
import { UmlNode } from './entities/uml-node.entity';
import { UmlAttribute } from './entities/uml-attribute.entity';
import { UmlMethod } from './entities/uml-method.entity';
import { UmlConnection } from './entities/uml-connection.entity';
import { DiagramRepository } from './repositories/diagram.repository';
import { UmlNodeRepository } from './repositories/uml-node.repository';
import { UmlAttributeRepository } from './repositories/uml-attribute.repository';
import { UmlMethodRepository } from './repositories/uml-method.repository';
import { UmlConnectionRepository } from './repositories/uml-connection.repository';
import { DiagramService } from './services/diagram.service';
import { DiagramController } from './controllers/diagram.controller';
import { ProjectsModule } from '../projects/projects.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Diagram,
      UmlNode,
      UmlAttribute,
      UmlMethod,
      UmlConnection,
    ]),
    forwardRef(() => ProjectsModule),
    AuthModule,
  ],
  controllers: [DiagramController],
  providers: [
    DiagramService,
    DiagramRepository,
    UmlNodeRepository,
    UmlAttributeRepository,
    UmlMethodRepository,
    UmlConnectionRepository,
  ],
  exports: [
    DiagramService,
    DiagramRepository,
    UmlNodeRepository,
    UmlAttributeRepository,
    UmlMethodRepository,
    UmlConnectionRepository,
  ],
})
export class DiagramsModule {}
