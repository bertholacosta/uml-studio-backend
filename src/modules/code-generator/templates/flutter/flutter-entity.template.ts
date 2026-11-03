import { JavaClassMeta } from '../spring_boot/template-models';
import { getDartFields } from './flutter-models';
import { renderMustache } from '../mustache-renderer';

const FLUTTER_ENTITY_MUSTACHE = `import 'package:equatable/equatable.dart';

/// Entidad pura de Dominio para {{className}} (Clean Architecture).
class {{className}}Entity extends Equatable {
{{#fields}}
  final {{dartType}}{{#isNullableQuestion}}?{{/isNullableQuestion}} {{name}};
{{/fields}}

  const {{className}}Entity({
{{#fields}}
    {{#isRequired}}required {{/isRequired}}this.{{name}},
{{/fields}}
  });

  @override
  List<Object?> get props => [{{propsList}}];
}
`;

export function renderFlutterEntity(meta: JavaClassMeta): string {
  const dartFields = getDartFields(meta);

  const fields = dartFields.map((f) => {
    const isNullable = f.isNullable && !f.isId;
    return {
      name: f.name,
      dartType: f.dartType,
      isNullableQuestion: isNullable,
      isRequired: !isNullable,
    };
  });

  const propsList = dartFields.map((f) => f.name).join(', ');

  return renderMustache(FLUTTER_ENTITY_MUSTACHE, {
    className: meta.className,
    fields,
    propsList,
  });
}
