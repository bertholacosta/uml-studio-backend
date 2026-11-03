import { Module } from '@nestjs/common';
import { CodeGeneratorController } from './controllers/code-generator.controller';
import { XmiController } from './controllers/xmi.controller';
import { CodeGeneratorService } from './services/code-generator.service';
import { SpringTemplateEngineService } from './services/spring-template-engine.service';
import { ZipArchiverService } from './services/zip-archiver.service';
import { FlutterTemplateEngineService } from './services/flutter-template-engine.service';
import { XmiExporterService } from './services/xmi-exporter.service';
import { XmiParserService } from './services/xmi-parser.service';
import { XmiInteropService } from './services/xmi-interop.service';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [DiagramsModule, ProjectsModule],
  controllers: [CodeGeneratorController, XmiController],
  providers: [
    CodeGeneratorService,
    SpringTemplateEngineService,
    FlutterTemplateEngineService,
    ZipArchiverService,
    XmiExporterService,
    XmiParserService,
    XmiInteropService,
  ],
  exports: [
    CodeGeneratorService,
    SpringTemplateEngineService,
    FlutterTemplateEngineService,
    ZipArchiverService,
    XmiExporterService,
    XmiParserService,
    XmiInteropService,
  ],
})
export class CodeGeneratorModule {}
