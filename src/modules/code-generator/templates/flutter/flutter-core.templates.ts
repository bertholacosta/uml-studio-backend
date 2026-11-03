import * as path from 'path';
import { ProjectContext, toCamelCase } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderApiConstants(context: ProjectContext): string {
  const port = context.serverPort || 8080;
  const entityEndpoints = context.classes.map((c) => ({
    camelName: toCamelCase(c.className),
    path: `/${c.tableName.replace(/_/g, '-')}`,
  }));

  const template = loadTemplate(
    path.join(__dirname, 'flutter-api-constants.template.mustache'),
  );
  return renderMustache(template, {
    port,
    entityEndpoints,
    hasAuth: context.hasAuth,
  });
}

export function renderExceptions(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-exceptions.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFailures(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-failures.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderApiClient(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-api-client.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderAppTheme(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-app-theme.template.mustache'),
  );
  return renderMustache(template, {});
}
