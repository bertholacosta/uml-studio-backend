import * as path from 'path';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderResourceNotFoundException(basePackage: string): string {
  const templatePath = path.join(
    __dirname,
    'resource-not-found.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, { basePackage });
}

export function renderGlobalExceptionHandler(
  basePackage: string,
  hasAuth = false,
): string {
  const templatePath = path.join(
    __dirname,
    'global-exception-handler.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, { basePackage, hasAuth });
}
