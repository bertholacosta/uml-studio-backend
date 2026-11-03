import * as path from 'path';
import { ProjectContext, toSnakeCase } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterReadme(context: ProjectContext): string {
  const port = context.serverPort || 8080;

  const featureTrees = context.classes.map((c) => ({
    snake: toSnakeCase(c.className),
  }));

  const crudModules = context.classes.map((c) => ({
    className: c.className,
  }));

  const template = loadTemplate(
    path.join(__dirname, 'flutter-readme.template.mustache'),
  );
  return (
    renderMustache(template, {
      projectName: context.projectName,
      port,
      featureTrees,
      crudModules,
    }) + '\n'
  );
}
