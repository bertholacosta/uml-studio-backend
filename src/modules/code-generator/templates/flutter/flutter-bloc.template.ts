import * as path from 'path';
import {
  JavaClassMeta,
  toSnakeCase,
  toCamelCase,
} from '../spring_boot/template-models';
import { getPluralName } from './flutter-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterBlocEvents(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-bloc-events.template.mustache',
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

export function renderFlutterBlocStates(meta: JavaClassMeta): string {
  const templatePath = path.join(
    __dirname,
    'flutter-bloc-states.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);
  const camel = toCamelCase(meta.className);
  const classPlural = getPluralName(meta.className);
  const camelPlural = toCamelCase(classPlural);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    classPlural,
    camelPlural,
    camel,
    snake,
  });
}

export function renderFlutterBloc(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'flutter-bloc.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);
  const snake = toSnakeCase(meta.className);
  const classPlural = getPluralName(meta.className);
  const snakePlural = getPluralName(snake);

  return renderMustache(mustacheTemplate, {
    className: meta.className,
    classPlural,
    snake,
    snakePlural,
  });
}
