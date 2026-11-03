import * as path from 'path';
import { JavaClassMeta, toSnakeCase } from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterDomainRepository(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-domain-repository.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    snake,
  });
}

export function renderFlutterDataRepository(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-data-repository.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    snake,
  });
}
