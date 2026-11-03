import * as path from 'path';
import { ProjectContext, toSnakeCase } from '../spring_boot/template-models';
import { getDartFields, getPluralName } from './flutter-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterAiMessageModel(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-ai-message-model.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterModelDownloaderService(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-model-downloader-service.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterLocalLlmService(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-local-llm-service.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterAiService(context: ProjectContext): string {
  const entities = context.classes.map((meta) => {
    const snake = toSnakeCase(meta.className);
    const singular = snake.replace(/_/g, ' ');
    const plural = getPluralName(snake).replace(/_/g, ' ');
    const endpoint = meta.tableName.replace(/_/g, '-');

    const fields = getDartFields(meta).map((f, idx, arr) => ({
      name: f.name,
      type: f.dartType,
      isId: f.isId,
      isNullable: f.isNullable,
      last: idx === arr.length - 1,
    }));

    return {
      name: meta.className,
      singular,
      plural,
      endpoint,
      fields,
    };
  });

  const template = loadTemplate(
    path.join(__dirname, 'flutter-ai-service.template.mustache'),
  );
  return renderMustache(template, {
    projectName: context.projectName,
    entities,
  });
}

export function renderFlutterAiBloc(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-ai-bloc.template.mustache'),
  );
  return renderMustache(template, {});
}

export function renderFlutterAiPage(context: ProjectContext): string {
  const sampleSuggestions = [];

  for (const meta of context.classes.slice(0, 3)) {
    const snake = toSnakeCase(meta.className);
    const singular = snake.replace(/_/g, ' ');
    const plural = getPluralName(snake).replace(/_/g, ' ');
    const nonIdFields = meta.fields.filter((f) => !f.isId && !f.isForeignKey);

    const fieldExamples = nonIdFields
      .slice(0, 3)
      .map((f) => {
        if (f.name.toLowerCase().includes('email'))
          return `${f.name} juan@gmail.com`;
        if (f.name.toLowerCase().includes('pass')) return `${f.name} 123456`;
        if (
          f.javaType.toLowerCase().includes('double') ||
          f.javaType.toLowerCase().includes('int')
        )
          return `${f.name} 100`;
        if (
          f.javaType.toLowerCase() === 'uuid' ||
          f.name.toLowerCase().endsWith('id')
        )
          return `${f.name} a9fa1103-76f8-4ca3-9400-1fdce16e57bc`;
        return `${f.name} Ejemplo`;
      })
      .join(', ');

    sampleSuggestions.push({
      label: `Registrar ${singular}`,
      prompt: `Registra un ${singular} con ${fieldExamples}`,
    });

    sampleSuggestions.push({
      label: `Listar ${plural}`,
      prompt: `Listar ${plural}`,
    });
  }

  const template = loadTemplate(
    path.join(__dirname, 'flutter-ai-page.template.mustache'),
  );
  return renderMustache(template, {
    projectName: context.projectName,
    sampleSuggestions,
  });
}
