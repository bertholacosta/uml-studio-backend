import { Injectable, NotFoundException } from '@nestjs/common';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { SpringTemplateEngineService } from './spring-template-engine.service';
import { FlutterTemplateEngineService } from './flutter-template-engine.service';
import { ZipArchiverService } from './zip-archiver.service';
import { GenerateCodeRequestDto } from '../dtos/generate-code-request.dto';
import {
  CodeGenerationPreviewResponseDto,
  GeneratedFileDto,
} from '../dtos/code-generation-preview-response.dto';

@Injectable()
export class CodeGeneratorService {
  constructor(
    private readonly diagramRepository: DiagramRepository,
    private readonly access: ProjectAccessService,
    private readonly springTemplateEngine: SpringTemplateEngineService,
    private readonly flutterTemplateEngine: FlutterTemplateEngineService,
    private readonly zipArchiver: ZipArchiverService,
  ) {}

  /**
   * Genera los archivos del proyecto según la plataforma seleccionada (Spring Boot, Flutter, o All).
   */
  private generateFiles(
    dto: GenerateCodeRequestDto,
    nodes: any[],
    connections: any[],
  ): { projectName: string; files: GeneratedFileDto[] } {
    const platform = dto.platform || 'all';

    // 1. Generar contexto y archivos base de Spring Boot
    const { context, files: springFiles } =
      this.springTemplateEngine.generateProjectFiles(dto, nodes, connections);

    if (platform === 'spring-boot') {
      return {
        projectName: context.projectName,
        files: springFiles,
      };
    }

    // 2. Generar archivos de Flutter Clean Architecture
    if (platform === 'flutter') {
      const flutterFiles =
        this.flutterTemplateEngine.generateFlutterProjectFiles(context, '');
      return {
        projectName: `${context.projectName} (Flutter App)`,
        files: flutterFiles,
      };
    }

    // 3. Platform === 'all' (Solución Fullstack Completa)
    // Spring Boot en 'backend/' y Flutter en 'mobile_flutter/'
    const combinedFiles: GeneratedFileDto[] = [];

    for (const f of springFiles) {
      combinedFiles.push({
        ...f,
        path: `backend/${f.path}`,
      });
    }

    const flutterFiles = this.flutterTemplateEngine.generateFlutterProjectFiles(
      context,
      'mobile_flutter',
    );
    combinedFiles.push(...flutterFiles);

    // README Maestro del Proyecto Fullstack
    const masterReadme = `# 🌟 ${context.projectName} (Fullstack Solution)

Solución de software completa autogenerada a partir de modelo de clases UML:
1. **Backend REST:** Spring Boot 3.5 + Java 21 + PostgreSQL 16 + Flyway Migrations + Swagger UI (\`backend/\`)
2. **Frontend Móvil:** Flutter con Clean Architecture + BLoC + Dio + GetIt (\`mobile_flutter/\`)

---

## 🚀 1. Iniciar Backend con Docker Compose

\`\`\`bash
cd backend
docker compose up --build
\`\`\`
* **Swagger UI interactivo:** [http://localhost:${context.serverPort || 8080}/swagger-ui.html](http://localhost:${context.serverPort || 8080}/swagger-ui.html)
* **API REST Base:** \`http://localhost:${context.serverPort || 8080}/api/v1\`

---

## 📱 2. Ejecutar la Aplicación Móvil en Flutter

Conecta tu teléfono Android por cable USB y ejecuta:

\`\`\`bash
# 1. Redireccionar puerto USB
adb reverse tcp:${context.serverPort || 8080} tcp:${context.serverPort || 8080}

# 2. Iniciar Flutter App
cd mobile_flutter
flutter pub get
flutter run
\`\`\`
`;

    combinedFiles.push({
      path: 'README.md',
      filename: 'README.md',
      language: 'markdown',
      layer: 'docs',
      content: masterReadme,
    });

    return {
      projectName: context.projectName,
      files: combinedFiles,
    };
  }

  /**
   * Genera la vista previa de archivos a partir de un diagrama persistido.
   */
  async previewFromDiagramId(
    diagramId: string,
    dto: GenerateCodeRequestDto,
    userId: string,
  ): Promise<CodeGenerationPreviewResponseDto> {
    await this.access.assertDiagramAccess(diagramId, userId, 'read');
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    const nodes =
      dto.nodes && dto.nodes.length > 0 ? dto.nodes : diagram.nodes || [];
    const connections =
      dto.connections && dto.connections.length > 0
        ? dto.connections
        : diagram.connections || [];

    const effectiveDto: GenerateCodeRequestDto = {
      ...dto,
      projectName: dto.projectName || diagram.name,
      artifactId:
        dto.artifactId ||
        diagram.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };

    const { projectName, files } = this.generateFiles(
      effectiveDto,
      nodes,
      connections,
    );

    return {
      projectName,
      totalFiles: files.length,
      files,
    };
  }

  /**
   * Genera y empaqueta en un archivo ZIP descargable el proyecto completo a partir del ID del diagrama.
   */
  async downloadZipFromDiagramId(
    diagramId: string,
    dto: GenerateCodeRequestDto,
    userId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const preview = await this.previewFromDiagramId(diagramId, dto, userId);
    const rootDirName = dto.artifactId || 'fullstack-uml-project';
    const zipBuffer = await this.zipArchiver.createZipBuffer(
      preview.files,
      rootDirName,
    );

    return {
      filename: `${rootDirName}.zip`,
      buffer: zipBuffer,
    };
  }
}
