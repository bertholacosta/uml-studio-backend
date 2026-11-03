import * as path from 'path';
import { ProjectContext } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderMainApplication(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'main-application.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  const appClassName =
    context.artifactId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') + 'Application';

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    projectName: context.projectName,
    appClassName,
    hasAuth: context.hasAuth,
  });
}
