import * as fs from 'fs';
import * as path from 'path';
import { ProjectContext } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';
import { GeneratedFileDto } from '../../dtos/code-generation-preview-response.dto';

/** Versión de Gradle del wrapper incluido en el proyecto generado. */
export const GRADLE_VERSION = '9.8.2';
const SPRINGDOC_VERSION = '2.10.0';
const FOOJAY_RESOLVER_VERSION = '1.0.0';

export function renderBuildGradle(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'build-gradle.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    groupId: context.groupId || 'com.app',
    artifactId: context.artifactId || 'spring-boot-uml-api',
    springBootVersion: context.springBootVersion || '3.5.16',
    springdocVersion: SPRINGDOC_VERSION,
    javaVersion: context.javaVersion || '21',
    hasAuth: context.hasAuth,
  });
}

export function renderSettingsGradle(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'settings-gradle.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    artifactId: context.artifactId || 'spring-boot-uml-api',
    foojayVersion: FOOJAY_RESOLVER_VERSION,
  });
}

/**
 * Gradle Wrapper: el proyecto compila con ./gradlew sin tener Gradle instalado.
 * Los archivos se copian tal cual desde templates/spring_boot/gradle-wrapper.
 */
export function renderGradleWrapperFiles(): GeneratedFileDto[] {
  const dir = path.join(__dirname, 'gradle-wrapper');
  const read = (name: string) => fs.readFileSync(path.join(dir, name));
  return [
    {
      path: 'gradlew',
      filename: 'gradlew',
      language: 'shell',
      layer: 'config',
      content: read('gradlew').toString('utf8'),
      executable: true,
    },
    {
      path: 'gradlew.bat',
      filename: 'gradlew.bat',
      language: 'bat',
      layer: 'config',
      content: read('gradlew.bat').toString('utf8'),
    },
    {
      path: 'gradle/wrapper/gradle-wrapper.jar',
      filename: 'gradle-wrapper.jar',
      language: 'binary',
      layer: 'config',
      content: read('gradle-wrapper.jar').toString('base64'),
      encoding: 'base64',
    },
    {
      path: 'gradle/wrapper/gradle-wrapper.properties',
      filename: 'gradle-wrapper.properties',
      language: 'properties',
      layer: 'config',
      content: [
        'distributionBase=GRADLE_USER_HOME',
        'distributionPath=wrapper/dists',
        // En .properties los dos puntos se escapan con «\:»
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
        'networkTimeout=10000',
        'validateDistributionUrl=true',
        'zipStoreBase=GRADLE_USER_HOME',
        'zipStorePath=wrapper/dists',
        '',
      ].join('\n'),
    },
  ];
}
