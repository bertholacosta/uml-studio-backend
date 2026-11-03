import * as path from 'path';
import { ProjectContext } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterLinuxRootCMake(context: ProjectContext): string {
  const appName = context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase();
  const template = loadTemplate(
    path.join(__dirname, 'flutter-linux-root-cmake.template.mustache'),
  );
  return renderMustache(template, { appName });
}

export function renderFlutterLinuxFlutterCMake(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-linux-flutter-cmake.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterLinuxRunnerCMake(context: ProjectContext): string {
  const appName = context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase();
  const template = loadTemplate(
    path.join(__dirname, 'flutter-linux-runner-cmake.template.mustache'),
  );
  return renderMustache(template, { appName });
}

export function renderFlutterLinuxMainCc(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-linux-main-cc.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterLinuxMyApplicationH(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-linux-my-application-h.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterLinuxMyApplicationCc(
  context: ProjectContext,
): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-linux-my-application-cc.template.mustache'),
  );
  return renderMustache(template, { projectName: context.projectName });
}
