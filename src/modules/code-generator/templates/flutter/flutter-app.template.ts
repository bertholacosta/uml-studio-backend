import * as path from 'path';
import {
  ProjectContext,
  toSnakeCase,
  withInherited,
} from '../spring_boot/template-models';
import { DartField, getDartFields, getPluralName } from './flutter-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

/** Campo de una entidad tal como lo describe `lib/schema.dart`. */
export interface SchemaField {
  name: string;
  /** text | int | double | bool | date | datetime | ids */
  type: string;
  isId: boolean;
  required: boolean;
  secret: boolean;
  hasRef: boolean;
  refName: string;
}

export interface SchemaEntity {
  name: string;
  singular: string;
  plural: string;
  endpoint: string;
  title: string;
  fields: SchemaField[];
}

const SECRET_NAME = /pass|contra|clave|pwd/i;

function schemaType(field: DartField): string {
  if (field.isIdList) return 'ids';
  if (field.isDateTime) return field.isDateOnly ? 'date' : 'datetime';
  if (['int', 'double', 'bool'].includes(field.dartType)) return field.dartType;
  return 'text';
}

/**
 * Las clases del diagrama como datos: la app genérica no tiene código por
 * entidad, lee este esquema. Una subclase incluye el id y los campos heredados,
 * igual que su API REST.
 */
export function buildFlutterSchema(context: ProjectContext): SchemaEntity[] {
  const classNames = new Set(context.classes.map((c) => c.className));

  return context.classes.map(withInherited).map((meta) => {
    const snake = toSnakeCase(meta.className);
    const fields: SchemaField[] = getDartFields(meta).map((f) => {
      const hasRef = !!f.refClassName && classNames.has(f.refClassName);
      return {
        name: f.name,
        type: schemaType(f),
        isId: f.isId,
        required: !f.isNullable && !f.isId,
        secret: !f.isId && SECRET_NAME.test(f.name),
        hasRef,
        refName: hasRef ? f.refClassName! : '',
      };
    });

    // El dato que nombra a un registro ante una persona: su primer texto visible
    const title =
      fields.find(
        (f) => !f.isId && f.type === 'text' && !f.secret && !f.hasRef,
      ) ||
      fields.find((f) => f.isId) ||
      fields[0];

    return {
      name: meta.className,
      singular: snake.replace(/_/g, ' '),
      plural: getPluralName(snake).replace(/_/g, ' '),
      endpoint: `/${meta.tableName.replace(/_/g, '-')}`,
      title: title?.name ?? 'id',
      fields,
    };
  });
}

/** Texto seguro dentro de una cadena Dart entre comillas simples. */
function dartString(text: string): string {
  return text.replace(/[\\'$]/g, (ch) => `\\${ch}`);
}

function render(name: string, view: Record<string, unknown> = {}): string {
  const template = loadTemplate(
    path.join(__dirname, `flutter-${name}.template.mustache`),
  );
  return renderMustache(template, view);
}

export function renderFlutterConfig(context: ProjectContext): string {
  return render('config', {
    projectName: dartString(context.projectName),
    port: context.serverPort || 8080,
  });
}

export function renderFlutterSchema(context: ProjectContext): string {
  return render('schema', { entities: buildFlutterSchema(context) });
}

export function renderFlutterApi(context: ProjectContext): string {
  return render('api', { hasAuth: !!context.hasAuth });
}

export function renderFlutterMain(context: ProjectContext): string {
  return render('main', { hasAuth: !!context.hasAuth });
}

export function renderFlutterHomeScreen(context: ProjectContext): string {
  return render('home-screen', { hasAuth: !!context.hasAuth });
}

export function renderFlutterRecordsScreen(): string {
  return render('records-screen');
}

export function renderFlutterRecordForm(): string {
  return render('record-form');
}

export function renderFlutterLoginScreen(context: ProjectContext): string {
  return render('login-screen', {
    userClassName: context.userClass?.className ?? '',
  });
}

export function renderFlutterLocalModel(): string {
  return render('local-model');
}

export function renderFlutterInterpreter(): string {
  return render('interpreter');
}

export function renderFlutterAssistant(): string {
  return render('assistant');
}

export function renderFlutterAssistantScreen(): string {
  return render('assistant-screen');
}
