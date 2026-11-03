import { Injectable } from '@nestjs/common';
import {
  JavaClassMeta,
  JavaField,
  JavaRelationship,
  ProjectContext,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toSingular,
  mapTypeToSql,
  normalizeJavaType,
  isAuthEligibleUserClass,
  withInherited,
} from '../templates/spring_boot/template-models';
import {
  prepareModel,
  defaultJoinTable,
  applyInheritance,
  collectJoinTables,
  NON_STRUCTURAL_RELATIONS,
} from '../templates/spring_boot/model-preparation';
import { renderEntity } from '../templates/spring_boot/entity.template';
import { renderRepository } from '../templates/spring_boot/repository.template';
import {
  renderCreateDto,
  renderUpdateDto,
  renderResponseDto,
} from '../templates/spring_boot/dto.template';
import { renderService } from '../templates/spring_boot/service.template';
import { renderController } from '../templates/spring_boot/controller.template';
import {
  renderResourceNotFoundException,
  renderGlobalExceptionHandler,
} from '../templates/spring_boot/exception.template';
import { renderFlywayMigration } from '../templates/spring_boot/flyway.template';
import {
  renderBuildGradle,
  renderSettingsGradle,
  renderGradleWrapperFiles,
} from '../templates/spring_boot/gradle.template';
import { renderApplicationYml } from '../templates/spring_boot/application-yml.template';
import { renderMainApplication } from '../templates/spring_boot/main-application.template';
import {
  renderDockerfile,
  renderDockerCompose,
  renderDockerfileLocal,
  renderDockerComposeLocal,
} from '../templates/spring_boot/docker.template';
import { renderReadme } from '../templates/spring_boot/readme.template';
import {
  renderJwtTokenProvider,
  renderUserPrincipal,
  renderCustomUserDetailsService,
  renderJwtAuthenticationFilter,
  renderSecurityConfig,
  renderLoginRequestDto,
  renderRegisterRequestDto,
  renderAuthResponseDto,
  renderAuthService,
  renderAuthController,
  renderDataInitializer,
} from '../templates/spring_boot/security.template';
import { GeneratedFileDto } from '../dtos/code-generation-preview-response.dto';
import { GenerateCodeRequestDto } from '../dtos/generate-code-request.dto';

@Injectable()
export class SpringTemplateEngineService {
  /**
   * Procesa el AST del diagrama y genera todos los archivos del microservicio Spring Boot.
   */
  generateProjectFiles(
    dto: GenerateCodeRequestDto,
    nodes: any[],
    connections: any[],
  ): { context: ProjectContext; files: GeneratedFileDto[] } {
    const packageName = (dto.packageName || 'com.app.studio')
      .trim()
      .toLowerCase();
    const artifactId = (dto.artifactId || 'spring-boot-uml-api')
      .trim()
      .toLowerCase();
    // Por defecto el groupId es el paquete sin su último segmento (com.uagrm.tienda -> com.uagrm)
    const groupId = (
      dto.groupId ||
      packageName.split('.').slice(0, -1).join('.') ||
      packageName
    )
      .trim()
      .toLowerCase();
    const projectName = dto.projectName || 'Spring Boot UML Microservice';
    const javaVersion = dto.javaVersion || '21';
    const springBootVersion = dto.springBootVersion || '3.5.16';
    const databaseName = dto.databaseName || 'app_db';
    const databaseUser = dto.databaseUser || 'postgres';
    const databasePassword = dto.databasePassword || 'postgres';
    const databasePort = dto.databasePort || 5432;
    const serverPort = dto.serverPort || 8080;

    // 1. Preparar el modelo: herencias, tablas intermedias M:N y relaciones que sí generan columnas
    const model = prepareModel(nodes || [], connections || []);
    const validNodes = model.classNodes;
    connections = model.connections;

    // Mapeo id de nodo -> nombre de clase
    const nodeIdToNameMap = new Map<string, string>();
    for (const node of validNodes) {
      nodeIdToNameMap.set(node.id, toPascalCase(node.name));
    }

    // 2. Extraer metadatos de clases y relaciones
    const classes: JavaClassMeta[] = validNodes.map((node) => {
      const className = toPascalCase(node.name);
      const tableName = toSnakeCase(node.name);

      // Campos / Atributos
      const rawAttrs = node.attributes || [];
      const fields: JavaField[] = [];
      let hasId = false;

      for (const attr of rawAttrs) {
        const rawName = attr.name || 'campo';
        const rawLower = rawName.toLowerCase();
        const tableLower = tableName.toLowerCase();

        let singularTable = tableLower;
        if (tableLower.endsWith('ies')) {
          singularTable = tableLower.slice(0, -3) + 'y';
        } else if (tableLower.endsWith('es')) {
          singularTable = tableLower.slice(0, -2);
        } else if (tableLower.endsWith('s')) {
          singularTable = tableLower.slice(0, -1);
        }

        const rawClean = rawLower.replace(/[^a-z0-9]/g, '');
        const tableClean = tableLower.replace(/[^a-z0-9]/g, '');
        const singularClean = singularTable.replace(/[^a-z0-9]/g, '');

        const isId =
          rawLower === 'id' ||
          rawLower === `${tableLower}_id` ||
          rawLower === `id_${tableLower}` ||
          rawLower === `${singularTable}_id` ||
          rawLower === `id_${singularTable}` ||
          rawClean === 'id' ||
          rawClean === `${tableClean}id` ||
          rawClean === `id${tableClean}` ||
          rawClean === `${singularClean}id` ||
          rawClean === `id${singularClean}` ||
          toSnakeCase(rawName) === 'id' ||
          toSnakeCase(rawName) === `${tableLower}_id` ||
          toSnakeCase(rawName) === `${singularTable}_id`;
        const javaType = normalizeJavaType(
          attr.type || (isId ? 'UUID' : 'String'),
        );
        const isText =
          !isId &&
          String(attr.type || '')
            .trim()
            .toLowerCase() === 'text';
        const fieldName = toCamelCase(rawName);

        if (isId) hasId = true;

        fields.push({
          name: fieldName,
          javaType,
          sqlColumnName: toSnakeCase(rawName),
          sqlType: isText ? 'TEXT' : mapTypeToSql(javaType),
          isText,
          isId,
          isNullable: isId ? false : (attr.isNullable ?? true),
          isUnique: isId ? true : (attr.isUnique ?? false),
          isAutoIncrement: attr.isAutoIncrement ?? false,
          getterName:
            'get' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
          setterName:
            'set' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
        });
      }

      // Si no definió un campo ID explícito, creamos 'id: UUID' por defecto
      let idField: JavaField;
      if (!hasId) {
        idField = {
          name: 'id',
          javaType: 'UUID',
          sqlColumnName: 'id',
          sqlType: 'UUID',
          isId: true,
          isNullable: false,
          isUnique: true,
          isAutoIncrement: false,
          getterName: 'getId',
          setterName: 'setId',
        };
        fields.unshift(idField);
      } else {
        idField = fields.find((f) => f.isId)!;
      }

      // Métodos
      const methods = (node.methods || []).map((m: any) => ({
        name: toCamelCase(m.name || 'operacion'),
        parameters: m.parameters || '',
        returnType: normalizeJavaType(m.returnType || 'void'),
      }));

      // Relaciones que involucran a esta clase
      const relationships: JavaRelationship[] = [];
      for (const conn of connections || []) {
        const sourceBaseId =
          conn.sourceNodeId ||
          conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
        const targetBaseId =
          conn.targetNodeId ||
          conn.targetId?.replace(/_(top|bottom|left|right)$/, '');

        const isSource = sourceBaseId === node.id;
        const isTarget = targetBaseId === node.id;

        if (!isSource && !isTarget) continue;
        // La herencia se resuelve aparte; realización y dependencia no generan columnas
        if (NON_STRUCTURAL_RELATIONS.has(conn.type)) continue;

        const targetNodeId = isSource ? targetBaseId : sourceBaseId;
        const targetClassName = nodeIdToNameMap.get(targetNodeId);
        if (!targetClassName || targetClassName === className) continue;

        const sourceMult = conn.sourceMultiplicity || '1';
        const targetMult = conn.targetMultiplicity || '1..*';

        const sourceIsMany =
          sourceMult.includes('*') ||
          sourceMult.includes('n') ||
          sourceMult.includes('m');
        const targetIsMany =
          targetMult.includes('*') ||
          targetMult.includes('n') ||
          targetMult.includes('m');

        if (sourceIsMany && targetIsMany) {
          // N:M: el origen de la relación es el dueño y declara la tabla de unión
          // (la tabla intermedia del diagrama); el destino solo la refleja con mappedBy
          const sourceClassName = isSource ? className : targetClassName;
          const join =
            model.joinTables.get(conn.id) ||
            defaultJoinTable(
              sourceClassName,
              isSource ? targetClassName : className,
            );
          relationships.push({
            type: 'MANY_TO_MANY',
            targetClassName,
            targetPackage: `${packageName}.entities`,
            fieldName: toCamelCase(targetClassName) + 'List',
            sourceMultiplicity: isSource ? sourceMult : targetMult,
            targetMultiplicity: isSource ? targetMult : sourceMult,
            ...(isSource
              ? {
                  isOwner: true,
                  joinTable: join.tableName,
                  joinColumnName: join.sourceColumn,
                  inverseJoinColumnName: join.targetColumn,
                  idsFieldName:
                    toCamelCase(toSingular(targetClassName)) + 'Ids',
                }
              : { isOwner: false, mappedBy: toCamelCase(className) + 'List' }),
          });
        } else if (isSource) {
          if (targetIsMany) {
            // 1:N -> En el lado origen es ONE_TO_MANY
            relationships.push({
              type: 'ONE_TO_MANY',
              targetClassName,
              targetPackage: `${packageName}.entities`,
              fieldName: toCamelCase(targetClassName) + 'List',
              mappedBy: toCamelCase(toSingular(className)),
              sourceMultiplicity: sourceMult,
              targetMultiplicity: targetMult,
            });
          } else {
            // N:1 o 1:1 -> En el lado origen es MANY_TO_ONE
            const { joinColumnName, matchedField } =
              findMatchingForeignKeyField(targetClassName, fields);
            if (matchedField) matchedField.isForeignKey = true;
            relationships.push({
              type: 'MANY_TO_ONE',
              targetClassName,
              targetPackage: `${packageName}.entities`,
              fieldName: toCamelCase(toSingular(targetClassName)),
              joinColumnName,
              sourceMultiplicity: sourceMult,
              targetMultiplicity: targetMult,
            });
          }
        } else {
          // Lado destino (isTarget)
          if (targetIsMany) {
            // El lado destino es el 'Many' en 1:N -> Genera @MANY_TO_ONE
            const { joinColumnName, matchedField } =
              findMatchingForeignKeyField(targetClassName, fields);
            if (matchedField) matchedField.isForeignKey = true;
            relationships.push({
              type: 'MANY_TO_ONE',
              targetClassName,
              targetPackage: `${packageName}.entities`,
              fieldName: toCamelCase(toSingular(targetClassName)),
              joinColumnName,
              sourceMultiplicity: targetMult,
              targetMultiplicity: sourceMult,
            });
          } else if (sourceIsMany) {
            // El lado destino es el 'One' en N:1 -> Genera @ONE_TO_MANY
            relationships.push({
              type: 'ONE_TO_MANY',
              targetClassName,
              targetPackage: `${packageName}.entities`,
              fieldName: toCamelCase(targetClassName) + 'List',
              mappedBy: toCamelCase(toSingular(className)),
              sourceMultiplicity: targetMult,
              targetMultiplicity: sourceMult,
            });
          } else {
            // 1:1
            const { joinColumnName, matchedField } =
              findMatchingForeignKeyField(targetClassName, fields);
            if (matchedField) matchedField.isForeignKey = true;
            relationships.push({
              type: 'ONE_TO_ONE',
              targetClassName,
              targetPackage: `${packageName}.entities`,
              fieldName: toCamelCase(toSingular(targetClassName)),
              joinColumnName,
              sourceMultiplicity: targetMult,
              targetMultiplicity: sourceMult,
            });
          }
        }
      }

      // Marcar cualquier campo que coincida con joinColumnName de una relación
      for (const rel of relationships) {
        if (rel.joinColumnName) {
          const colLower = rel.joinColumnName.toLowerCase();
          for (const f of fields) {
            if (!f.isId && f.sqlColumnName.toLowerCase() === colLower) {
              f.isForeignKey = true;
            }
          }
        }
      }

      const hasDates = fields.some(
        (f) => f.javaType === 'LocalDate' || f.javaType === 'LocalDateTime',
      );
      const hasUuids = true;
      const hasBigDecimals = fields.some((f) => f.javaType === 'BigDecimal');

      return {
        className,
        tableName,
        packageName: `${packageName}.entities`,
        basePackage: packageName,
        idField,
        fields,
        methods,
        relationships,
        hasDates,
        hasUuids,
        hasBigDecimals,
      };
    });

    // 2.1. Herencia JOINED: la subclase comparte el id de la raíz y extiende a su padre
    applyInheritance(classes, model.generalizations, nodeIdToNameMap);

    // 2.2. Resolver tipos de ID y getters/setters para relaciones foráneas
    for (const cls of classes) {
      for (const rel of cls.relationships) {
        const targetCls = classes.find(
          (c) => c.className === rel.targetClassName,
        );
        if (targetCls && targetCls.idField) {
          rel.targetIdType = targetCls.idField.javaType;
          rel.targetIdGetterName = targetCls.idField.getterName;
          rel.targetIdSetterName = targetCls.idField.setterName;
        } else {
          rel.targetIdType = 'UUID';
          rel.targetIdGetterName = 'getId';
          rel.targetIdSetterName = 'setId';
        }
      }
    }

    const userClass = classes.find((c) => isAuthEligibleUserClass(c));
    const hasAuth = !!userClass;

    const context: ProjectContext = {
      packageName,
      artifactId,
      groupId,
      projectName,
      javaVersion,
      springBootVersion,
      databaseName,
      databaseUser,
      databasePassword,
      databasePort,
      serverPort,
      classes,
      hasAuth,
      userClass,
      joinTables: collectJoinTables(classes),
    };

    // 3. Renderizar archivos de todas las capas
    const files: GeneratedFileDto[] = [];
    const packagePath = 'src/main/java/' + packageName.replace(/\./g, '/');

    // Capa 1: Entidades JPA
    for (const meta of classes) {
      files.push({
        path: `${packagePath}/entities/${meta.className}.java`,
        filename: `${meta.className}.java`,
        language: 'java',
        layer: 'entity',
        content: renderEntity(meta),
      });
    }

    // Capa 2: Repositorios Spring Data JPA
    for (const meta of classes) {
      files.push({
        path: `${packagePath}/repositories/${meta.className}Repository.java`,
        filename: `${meta.className}Repository.java`,
        language: 'java',
        layer: 'repository',
        content: renderRepository(meta),
      });
    }

    // Capa 3: DTOs
    for (const meta of classes) {
      files.push({
        path: `${packagePath}/dtos/Create${meta.className}Dto.java`,
        filename: `Create${meta.className}Dto.java`,
        language: 'java',
        layer: 'dto',
        content: renderCreateDto(withInherited(meta)),
      });
      files.push({
        path: `${packagePath}/dtos/Update${meta.className}Dto.java`,
        filename: `Update${meta.className}Dto.java`,
        language: 'java',
        layer: 'dto',
        content: renderUpdateDto(withInherited(meta)),
      });
      files.push({
        path: `${packagePath}/dtos/${meta.className}ResponseDto.java`,
        filename: `${meta.className}ResponseDto.java`,
        language: 'java',
        layer: 'dto',
        content: renderResponseDto(withInherited(meta)),
      });
    }

    // Capa 4: Servicios (directamente en capa service, sin impl)
    for (const meta of classes) {
      files.push({
        path: `${packagePath}/services/${meta.className}Service.java`,
        filename: `${meta.className}Service.java`,
        language: 'java',
        layer: 'service',
        content: renderService(withInherited(meta), hasAuth),
      });
    }

    // Capa 5: Controladores REST con Swagger UI
    for (const meta of classes) {
      files.push({
        path: `${packagePath}/controllers/${meta.className}Controller.java`,
        filename: `${meta.className}Controller.java`,
        language: 'java',
        layer: 'controller',
        content: renderController(meta),
      });
    }

    // Módulo Especial: Autenticación JWT & Spring Security (si existe clase de usuario)
    if (hasAuth && userClass) {
      files.push({
        path: `${packagePath}/security/JwtTokenProvider.java`,
        filename: 'JwtTokenProvider.java',
        language: 'java',
        layer: 'config',
        content: renderJwtTokenProvider(context, userClass),
      });
      files.push({
        path: `${packagePath}/security/UserPrincipal.java`,
        filename: 'UserPrincipal.java',
        language: 'java',
        layer: 'config',
        content: renderUserPrincipal(context, userClass),
      });
      files.push({
        path: `${packagePath}/security/CustomUserDetailsService.java`,
        filename: 'CustomUserDetailsService.java',
        language: 'java',
        layer: 'config',
        content: renderCustomUserDetailsService(context, userClass),
      });
      files.push({
        path: `${packagePath}/security/JwtAuthenticationFilter.java`,
        filename: 'JwtAuthenticationFilter.java',
        language: 'java',
        layer: 'config',
        content: renderJwtAuthenticationFilter(context),
      });
      files.push({
        path: `${packagePath}/security/SecurityConfig.java`,
        filename: 'SecurityConfig.java',
        language: 'java',
        layer: 'config',
        content: renderSecurityConfig(context),
      });
      files.push({
        path: `${packagePath}/dtos/auth/LoginRequestDto.java`,
        filename: 'LoginRequestDto.java',
        language: 'java',
        layer: 'dto',
        content: renderLoginRequestDto(context),
      });
      files.push({
        path: `${packagePath}/dtos/auth/RegisterRequestDto.java`,
        filename: 'RegisterRequestDto.java',
        language: 'java',
        layer: 'dto',
        content: renderRegisterRequestDto(context, userClass),
      });
      files.push({
        path: `${packagePath}/dtos/auth/AuthResponseDto.java`,
        filename: 'AuthResponseDto.java',
        language: 'java',
        layer: 'dto',
        content: renderAuthResponseDto(context, userClass),
      });
      files.push({
        path: `${packagePath}/services/AuthService.java`,
        filename: 'AuthService.java',
        language: 'java',
        layer: 'service',
        content: renderAuthService(context, userClass),
      });
      files.push({
        path: `${packagePath}/controllers/AuthController.java`,
        filename: 'AuthController.java',
        language: 'java',
        layer: 'controller',
        content: renderAuthController(context, userClass),
      });
      files.push({
        path: `${packagePath}/security/DataInitializer.java`,
        filename: 'DataInitializer.java',
        language: 'java',
        layer: 'config',
        content: renderDataInitializer(context, userClass),
      });
    }

    // Excepciones Globales
    files.push({
      path: `${packagePath}/exceptions/ResourceNotFoundException.java`,
      filename: 'ResourceNotFoundException.java',
      language: 'java',
      layer: 'config',
      content: renderResourceNotFoundException(packageName),
    });
    files.push({
      path: `${packagePath}/exceptions/GlobalExceptionHandler.java`,
      filename: 'GlobalExceptionHandler.java',
      language: 'java',
      layer: 'config',
      content: renderGlobalExceptionHandler(packageName, hasAuth),
    });

    // Clase Principal Spring Boot
    const appClassName =
      artifactId
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('') + 'Application';

    files.push({
      path: `${packagePath}/${appClassName}.java`,
      filename: `${appClassName}.java`,
      language: 'java',
      layer: 'config',
      content: renderMainApplication(context),
    });

    // Script de Migración Flyway
    files.push({
      path: 'src/main/resources/db/migration/V1__create_tables.sql',
      filename: 'V1__create_tables.sql',
      language: 'sql',
      layer: 'migration',
      content: renderFlywayMigration(context),
    });

    // Configuración application.yml
    files.push({
      path: 'src/main/resources/application.yml',
      filename: 'application.yml',
      language: 'yaml',
      layer: 'config',
      content: renderApplicationYml(context),
    });

    // Build Gradle (build.gradle y settings.gradle)
    files.push({
      path: 'build.gradle',
      filename: 'build.gradle',
      language: 'groovy',
      layer: 'config',
      content: renderBuildGradle(context),
    });
    files.push({
      path: 'settings.gradle',
      filename: 'settings.gradle',
      language: 'groovy',
      layer: 'config',
      content: renderSettingsGradle(context),
    });

    files.push(...renderGradleWrapperFiles());

    // Dockerfile & docker-compose.yml (Modo autónomo desde cero)
    files.push({
      path: 'Dockerfile',
      filename: 'Dockerfile',
      language: 'dockerfile',
      layer: 'docker',
      content: renderDockerfile(context),
    });
    files.push({
      path: 'docker-compose.yml',
      filename: 'docker-compose.yml',
      language: 'yaml',
      layer: 'docker',
      content: renderDockerCompose(context),
    });

    // Dockerfile.local & docker-compose.local.yml (Modo local aprovechando herramientas del host)
    files.push({
      path: 'Dockerfile.local',
      filename: 'Dockerfile.local',
      language: 'dockerfile',
      layer: 'docker',
      content: renderDockerfileLocal(context),
    });
    files.push({
      path: 'docker-compose.local.yml',
      filename: 'docker-compose.local.yml',
      language: 'yaml',
      layer: 'docker',
      content: renderDockerComposeLocal(context),
    });

    // Documentación README.md
    files.push({
      path: 'README.md',
      filename: 'README.md',
      language: 'markdown',
      layer: 'docs',
      content: renderReadme(context),
    });

    return { context, files };
  }
}

function findMatchingForeignKeyField(
  targetClassName: string,
  fields: JavaField[],
): { joinColumnName: string; matchedField?: JavaField } {
  const targetSnake = toSnakeCase(targetClassName);

  const candidates = new Set<string>();
  candidates.add(`${targetSnake}_id`);
  candidates.add(targetSnake);
  candidates.add(`id_${targetSnake}`);

  let singular = targetSnake;
  if (targetSnake.endsWith('ies')) {
    singular = targetSnake.slice(0, -3) + 'y';
  } else if (targetSnake.endsWith('es')) {
    singular = targetSnake.slice(0, -2);
  } else if (targetSnake.endsWith('s')) {
    singular = targetSnake.slice(0, -1);
  }
  if (singular !== targetSnake) {
    candidates.add(`${singular}_id`);
    candidates.add(singular);
    candidates.add(`id_${singular}`);
  }

  const matched = fields.find((f) => {
    if (f.isId) return false;
    const colName = f.sqlColumnName.toLowerCase();
    const cleanFieldName = f.name.toLowerCase().replace(/_/g, '');
    for (const cand of candidates) {
      if (colName === cand || cleanFieldName === cand.replace(/_/g, '')) {
        return true;
      }
    }
    return false;
  });

  if (matched) {
    return { joinColumnName: matched.sqlColumnName, matchedField: matched };
  }

  return { joinColumnName: `${singular}_id` };
}
