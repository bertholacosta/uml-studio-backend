import * as path from 'path';
import { ProjectContext } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterAndroidBuildGradle(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-build-gradle.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterAndroidSettingsGradle(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-settings-gradle.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterAndroidAppBuildGradle(
  context: ProjectContext,
): string {
  const appId = `com.example.${context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase()}`;
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-app-build-gradle.template.mustache'),
  );
  return renderMustache(template, { appId });
}

export function renderFlutterAndroidManifest(context: ProjectContext): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-manifest.template.mustache'),
  );
  return renderMustache(template, { projectName: context.projectName });
}

export function renderFlutterMainActivity(context: ProjectContext): string {
  const appId = `com.example.${context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase()}`;
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-main-activity.template.mustache'),
  );
  return renderMustache(template, { appId });
}

export function renderFlutterLocalProperties(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-local-properties.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterGradleProperties(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-gradle-properties.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterGradleWrapperProperties(): string {
  const template = loadTemplate(
    path.join(
      __dirname,
      'flutter-android-gradle-wrapper-properties.template.mustache',
    ),
  );
  return renderMustache(template, {});
}

export function renderFlutterMetadata(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-metadata.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterStylesXml(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-android-styles-xml.template.mustache'),
  );
  return renderMustache(template, {});
}
