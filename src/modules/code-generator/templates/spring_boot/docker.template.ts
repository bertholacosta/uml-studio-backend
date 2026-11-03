import * as path from 'path';
import { ProjectContext } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

function resolveJavaVersion(context: ProjectContext): string {
  const v = (context.javaVersion || '').trim();
  if (v && /^\d+$/.test(v)) {
    return v;
  }
  return '21';
}

export function renderDockerfile(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'dockerfile.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const javaVer = resolveJavaVersion(context);
  return renderMustache(mustacheTemplate, {
    javaVer,
    serverPort: context.serverPort || 8080,
  });
}

export function renderDockerCompose(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'docker-compose.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    artifactId: context.artifactId,
    databaseName: context.databaseName || 'app_db',
    databaseUser: context.databaseUser || 'postgres',
    databasePassword: context.databasePassword || 'postgres',
    databasePort: context.databasePort || 5432,
    serverPort: context.serverPort || 8080,
    hasAuth: context.hasAuth,
  });
}

export function renderDockerfileLocal(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'dockerfile-local.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  const javaVer = resolveJavaVersion(context);
  return renderMustache(mustacheTemplate, {
    javaVer,
    serverPort: context.serverPort || 8080,
  });
}

export function renderDockerComposeLocal(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'docker-compose-local.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    artifactId: context.artifactId,
    databaseName: context.databaseName || 'app_db',
    databaseUser: context.databaseUser || 'postgres',
    databasePassword: context.databasePassword || 'postgres',
    databasePort: context.databasePort || 5432,
    serverPort: context.serverPort || 8080,
    hasAuth: context.hasAuth,
  });
}
