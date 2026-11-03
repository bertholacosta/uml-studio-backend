import * as path from 'path';
import { ProjectContext } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderApplicationYml(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'application-yml.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    artifactId: context.artifactId,
    serverPort: context.serverPort || 8080,
    databasePort: context.databasePort || 5432,
    databaseName: context.databaseName || 'app_db',
    databaseUser: context.databaseUser || 'postgres',
    databasePassword: context.databasePassword || 'postgres',
    hasAuth: context.hasAuth,
  });
}
