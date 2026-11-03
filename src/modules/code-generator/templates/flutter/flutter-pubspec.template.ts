import * as path from 'path';
import { ProjectContext } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterPubspec(context: ProjectContext): string {
  const appName = context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase();
  const template = loadTemplate(
    path.join(__dirname, 'flutter-pubspec.template.mustache'),
  );
  return renderMustache(template, { appName });
}
