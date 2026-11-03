import * as path from 'path';
import { ProjectContext } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderReadme(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'readme.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const classes = context.classes.map((c) => ({
    className: c.className,
    endpointPath: c.tableName.replace(/_/g, '-'),
  }));

  return renderMustache(mustacheTemplate, {
    projectName: context.projectName,
    javaVer: context.javaVersion || '21',
    srvPort: context.serverPort || 8080,
    dbPort: context.databasePort || 5432,
    databaseName: context.databaseName || 'app_db',
    classes,
  });
}
