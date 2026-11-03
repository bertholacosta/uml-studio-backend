import * as path from 'path';
import {
  JavaClassMeta,
  toSnakeCase,
  toCamelCase,
} from '../spring_boot/template-models';
import { getDartFields, getPluralName, dateToJsonExpr } from './flutter-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterCardWidget(meta: JavaClassMeta): string {
  const snake = toSnakeCase(meta.className);
  const dartFields = getDartFields(meta);
  const isPass = (name: string) => {
    const n = name.toLowerCase();
    return n.includes('pass') || n.includes('contra') || n.includes('clave');
  };
  const titleField =
    dartFields.find((f) => !f.isId && f.isString && !isPass(f.name)) ||
    dartFields[0];
  const subtitleField =
    dartFields.find(
      (f) => !f.isId && !f.isIdList && f !== titleField && !isPass(f.name),
    ) || dartFields[1];

  const titleExpression = `item.${titleField.name}${titleField.isNullable ? ' ?? ""' : ''}`;
  const subtitleExpression = subtitleField
    ? `final subtitle = item.${subtitleField.name}${subtitleField.isNullable ? ' != null ? item.' + subtitleField.name + '.toString() : ""' : '.toString()'};`
    : `final subtitle = "";`;
  const idFieldName = dartFields.find((f) => f.isId)?.name || 'id';

  const template = loadTemplate(
    path.join(__dirname, 'flutter-card-widget.template.mustache'),
  );
  return renderMustache(template, {
    snake,
    className: meta.className,
    titleExpression,
    subtitleExpression,
    idFieldName,
  });
}

export function renderFlutterListPage(meta: JavaClassMeta): string {
  const snake = toSnakeCase(meta.className);
  const classPlural = getPluralName(meta.className);
  const dartFields = getDartFields(meta);
  const idField = dartFields.find((f) => f.isId) || dartFields[0];

  const template = loadTemplate(
    path.join(__dirname, 'flutter-list-page.template.mustache'),
  );
  return renderMustache(template, {
    snake,
    className: meta.className,
    classPlural,
    camelPlural: toCamelCase(classPlural),
    idFieldName: idField.name,
  });
}

export function renderFlutterFormPage(meta: JavaClassMeta): string {
  const snake = toSnakeCase(meta.className);
  const dartFields = getDartFields(meta);
  const editableFields = dartFields.filter((f) => !f.isId);
  const idField = dartFields.find((f) => f.isId) || dartFields[0];

  const controllersDef = editableFields.map((f) => ({ name: f.name }));

  const populateControllers = editableFields.map((f) => ({
    name: f.name,
    populateExpr: f.isIdList
      ? `widget.initialItem!.${f.name}?.join(', ') ?? ''`
      : f.isDateTime
        ? `${dateToJsonExpr(f, `widget.initialItem!.${f.name}${f.isNullable ? '?' : ''}`)} ?? ''`
        : `widget.initialItem!.${f.name}${f.isNullable ? '?' : ''}.toString() ?? ''`,
  }));

  const disposeControllers = editableFields.map((f) => ({ name: f.name }));

  const entityFields = dartFields.map((f) => {
    let valueExpr = '';
    if (f.isId) {
      valueExpr = `isEditing ? widget.initialItem!.${f.name} : ${f.dartType === 'int' ? '0' : "''"}`;
    } else if (f.isIdList) {
      // Ids separados por comas
      valueExpr = `_${f.name}Controller.text.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList()`;
    } else if (f.isDateTime) {
      valueExpr = `_${f.name}Controller.text.isNotEmpty ? DateTime.tryParse(_${f.name}Controller.text) : ${f.isNullable ? 'null' : 'DateTime.now()'}`;
    } else if (f.dartType === 'int') {
      valueExpr = `int.tryParse(_${f.name}Controller.text) ?? 0`;
    } else if (f.dartType === 'double') {
      valueExpr = `double.tryParse(_${f.name}Controller.text) ?? 0.0`;
    } else if (f.dartType === 'bool') {
      valueExpr = `_${f.name}Controller.text.toLowerCase() == 'true'`;
    } else {
      valueExpr = f.isNullable
        ? `_${f.name}Controller.text.trim().isNotEmpty ? _${f.name}Controller.text.trim() : null`
        : `_${f.name}Controller.text.trim()`;
    }
    return { name: f.name, valueExpr };
  });

  const formFields = editableFields.map((f) => {
    const label =
      f.name.charAt(0).toUpperCase() +
      f.name.slice(1) +
      (f.isIdList ? ' (separados por comas)' : '');
    const isPassword =
      f.name.toLowerCase().includes('pass') ||
      f.name.toLowerCase().includes('contra') ||
      f.name.toLowerCase().includes('clave');
    const isUuid =
      f.dartType === 'String' &&
      (f.name.toLowerCase().endsWith('id') ||
        f.name.toLowerCase().includes('uuid'));

    return {
      name: f.name,
      label,
      labelLower: label.toLowerCase(),
      obscureText: isPassword ? 'true' : 'false',
      prefixIcon: isPassword
        ? 'Icon(Icons.lock_outline)'
        : isUuid
          ? 'Icon(Icons.key_outlined)'
          : 'null',
      keyboardType: isPassword
        ? 'TextInputType.visiblePassword'
        : f.isNumber
          ? 'TextInputType.number'
          : f.isDateTime
            ? 'TextInputType.datetime'
            : 'TextInputType.text',
      isRequired: !f.isNullable,
      isUuid,
    };
  });

  const template = loadTemplate(
    path.join(__dirname, 'flutter-form-page.template.mustache'),
  );
  return renderMustache(template, {
    snake,
    className: meta.className,
    idFieldName: idField.name,
    controllersDef,
    populateControllers,
    disposeControllers,
    entityFields,
    formFields,
  });
}
