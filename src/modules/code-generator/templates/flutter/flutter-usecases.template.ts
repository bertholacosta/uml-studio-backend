import * as path from 'path';
import { JavaClassMeta, toSnakeCase } from '../spring_boot/template-models';
import { getPluralName } from './flutter-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterGetAllUseCase(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-get-all-usecase.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);
  const classPlural = getPluralName(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    classPlural,
    snake,
  });
}

export function renderFlutterGetByIdUseCase(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-get-by-id-usecase.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    snake,
  });
}

export function renderFlutterCreateUseCase(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-create-usecase.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    snake,
  });
}

export function renderFlutterUpdateUseCase(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-update-usecase.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    snake,
  });
}

export function renderFlutterDeleteUseCase(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-delete-usecase.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    snake,
  });
}
