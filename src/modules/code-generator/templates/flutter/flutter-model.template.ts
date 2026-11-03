import { JavaClassMeta, toSnakeCase } from '../spring_boot/template-models';
import { getDartFields, dateToJsonExpr } from './flutter-models';
import { renderMustache } from '../mustache-renderer';

const FLUTTER_MODEL_MUSTACHE = `import '../../domain/entities/{{snake}}_entity.dart';

/// Modelo de datos serializable para {{className}} con soporte JSON.
class {{className}}Model extends {{className}}Entity {
  const {{className}}Model({
{{#fields}}
    {{#isRequired}}required {{/isRequired}}super.{{name}},
{{/fields}}
  });

  factory {{className}}Model.fromJson(Map<String, dynamic> json) {
    return {{className}}Model(
{{#fromJsonFields}}
{{{line}}}
{{/fromJsonFields}}
    );
  }

  Map<String, dynamic> toJson() {
    return {
{{#toJsonFields}}
{{{line}}}
{{/toJsonFields}}
    };
  }

  factory {{className}}Model.fromEntity({{className}}Entity entity) {
    return {{className}}Model(
{{#fromEntityFields}}
      {{name}}: entity.{{name}},
{{/fromEntityFields}}
    );
  }
}
`;

const FLUTTER_REQUEST_MODEL_MUSTACHE = `import '../../domain/entities/{{snake}}_entity.dart';

/// DTO de solicitud para crear y actualizar {{className}}.
class {{className}}RequestModel {
{{#fields}}
  final {{dartType}}{{#isNullable}}?{{/isNullable}} {{name}};
{{/fields}}

  const {{className}}RequestModel({
{{#fields}}
    {{#isRequired}}required {{/isRequired}}this.{{name}},
{{/fields}}
  });

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{};
{{#mapFields}}
{{{line}}}
{{/mapFields}}
    return map;
  }

  factory {{className}}RequestModel.fromEntity({{className}}Entity entity) {
    return {{className}}RequestModel(
{{#fromEntityFields}}
      {{name}}: entity.{{name}},
{{/fromEntityFields}}
    );
  }
}
`;

export function renderFlutterModel(meta: JavaClassMeta): string {
  const dartFields = getDartFields(meta);
  const snake = toSnakeCase(meta.className);

  const fields = dartFields.map((f) => {
    const isNullable = f.isNullable && !f.isId;
    return {
      name: f.name,
      isRequired: !isNullable,
    };
  });

  const fromJsonFields = dartFields.map((f) => {
    const snakeKey = toSnakeCase(f.name);
    let line = '';
    if (f.isIdList) {
      line = `      ${f.name}: (json['${f.jsonKey}'] as List?)?.map((e) => e.toString()).toList() ?? const [],`;
    } else if (f.isDateTime) {
      line = `      ${f.name}: (json['${f.jsonKey}'] ?? json['${snakeKey}']) != null ? DateTime.parse((json['${f.jsonKey}'] ?? json['${snakeKey}']).toString()) : ${f.isNullable ? 'null' : 'DateTime.now()'},`;
    } else if (f.dartType === 'int') {
      line = `      ${f.name}: (json['${f.jsonKey}'] ?? json['${snakeKey}']) != null ? int.tryParse((json['${f.jsonKey}'] ?? json['${snakeKey}']).toString()) ?? 0 : 0,`;
    } else if (f.dartType === 'double') {
      line = `      ${f.name}: (json['${f.jsonKey}'] ?? json['${snakeKey}']) != null ? double.tryParse((json['${f.jsonKey}'] ?? json['${snakeKey}']).toString()) ?? 0.0 : 0.0,`;
    } else if (f.dartType === 'bool') {
      line = `      ${f.name}: (json['${f.jsonKey}'] ?? json['${snakeKey}']) == true || (json['${f.jsonKey}'] ?? json['${snakeKey}']) == 'true' || (json['${f.jsonKey}'] ?? json['${snakeKey}']) == 1,`;
    } else {
      line = `      ${f.name}: (json['${f.jsonKey}'] ?? json['${snakeKey}'])?.toString() ?? '',`;
    }
    return { line };
  });

  const toJsonFields = dartFields.map((f) => {
    let line = '';
    if (f.isDateTime) {
      line = `      '${f.jsonKey}': ${dateToJsonExpr(f, f.name + (f.isNullable ? '?' : ''))},`;
    } else {
      line = `      '${f.jsonKey}': ${f.name},`;
    }
    return { line };
  });

  const fromEntityFields = dartFields.map((f) => ({ name: f.name }));

  return renderMustache(FLUTTER_MODEL_MUSTACHE, {
    className: meta.className,
    snake,
    fields,
    fromJsonFields,
    toJsonFields,
    fromEntityFields,
  });
}

export function renderFlutterRequestModel(meta: JavaClassMeta): string {
  const dartFields = getDartFields(meta).filter((f) => !f.isId);
  const snake = toSnakeCase(meta.className);

  const fields = dartFields.map((f) => ({
    name: f.name,
    dartType: f.dartType,
    isNullable: f.isNullable,
    isRequired: !f.isNullable,
  }));

  const mapFields = dartFields.map((f) => {
    let line = '';
    if (f.isDateTime) {
      line = `    if (${f.name} != null) map['${f.name}'] = ${dateToJsonExpr(f, f.name + '!')};`;
    } else {
      line = `    if (${f.name} != null) map['${f.name}'] = ${f.name};`;
    }
    return { line };
  });

  const fromEntityFields = dartFields.map((f) => ({ name: f.name }));

  return renderMustache(FLUTTER_REQUEST_MODEL_MUSTACHE, {
    className: meta.className,
    snake,
    fields,
    mapFields,
    fromEntityFields,
  });
}
