import * as path from 'path';
import { ProjectContext } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';
import { buildFlutterSchema } from './flutter-app.template';

export function renderFlutterReadme(context: ProjectContext): string {
  // Los ejemplos del asistente usan la primera clase del diagrama
  const example = buildFlutterSchema(context)[0];
  const field = example?.fields.find((f) => !f.isId)?.name ?? 'nombre';

  const template = loadTemplate(
    path.join(__dirname, 'flutter-readme.template.mustache'),
  );
  return (
    renderMustache(template, {
      projectName: context.projectName,
      port: context.serverPort || 8080,
      hasAuth: !!context.hasAuth,
      singular: example?.singular ?? 'registro',
      plural: example?.plural ?? 'registros',
      field,
      classes: context.classes.map((c) => ({ className: c.className })),
    }) + '\n'
  );
}
