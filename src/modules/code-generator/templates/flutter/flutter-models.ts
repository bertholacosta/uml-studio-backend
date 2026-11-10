import { JavaClassMeta, toCamelCase } from '../spring_boot/template-models';

export interface DartField {
  name: string;
  dartType: string;
  jsonKey: string;
  isId: boolean;
  isNullable: boolean;
  isDateTime: boolean;
  isNumber: boolean;
  isBoolean: boolean;
  isString: boolean;
  defaultValue: string;
  /** LocalDate en el backend: se envía como «yyyy-MM-dd», sin hora. */
  isDateOnly?: boolean;
  /** Ids de una relación M:N (p. ej. categoriaIds): List<String>. */
  isIdList?: boolean;
  /** Clase a la que apunta el campo cuando guarda el id (o los ids) de una relación. */
  refClassName?: string;
}

export function mapJavaTypeToDart(javaType: string): string {
  const norm = (javaType || 'String').trim().toLowerCase();
  switch (norm) {
    case 'uuid':
    case 'string':
    case 'text':
      return 'String';
    case 'int':
    case 'integer':
      return 'int';
    case 'long':
      return 'int';
    case 'double':
    case 'float':
    case 'bigdecimal':
      return 'double';
    case 'boolean':
    case 'bool':
      return 'bool';
    case 'localdate':
    case 'localdatetime':
    case 'date':
    case 'timestamp':
      return 'DateTime';
    default:
      return 'String';
  }
}

export function getDartFields(meta: JavaClassMeta): DartField[] {
  // Excluir campos escalares que duplican una clave foránea para usar el nombre canónico de la relación
  const nonDuplicateFields = meta.fields.filter(
    (f) =>
      !f.isForeignKey &&
      !meta.relationships.some(
        (r) =>
          (r.type === 'MANY_TO_ONE' || r.type === 'ONE_TO_ONE') &&
          r.joinColumnName?.toLowerCase() === f.sqlColumnName.toLowerCase(),
      ),
  );

  const fields: DartField[] = nonDuplicateFields.map((f) => {
    const dartType = mapJavaTypeToDart(f.javaType);
    const isDateTime = dartType === 'DateTime';
    const isNumber = dartType === 'int' || dartType === 'double';
    const isBoolean = dartType === 'bool';
    const isString = dartType === 'String';

    let defaultValue = "''";
    if (dartType === 'int') defaultValue = '0';
    if (dartType === 'double') defaultValue = '0.0';
    if (dartType === 'bool') defaultValue = 'false';
    if (dartType === 'DateTime') defaultValue = 'DateTime.now()';

    return {
      name: f.name,
      dartType,
      jsonKey: f.name,
      isId: f.isId,
      isNullable: f.isNullable,
      isDateTime,
      isNumber,
      isBoolean,
      isString,
      defaultValue,
      isDateOnly: f.javaType === 'LocalDate',
    };
  });

  // Agregar Foreign Keys generadas a partir de relaciones MANY_TO_ONE y ONE_TO_ONE
  for (const rel of meta.relationships || []) {
    if (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE') {
      const fkCamel = toCamelCase(rel.fieldName) + 'Id';
      if (!fields.some((f) => f.name.toLowerCase() === fkCamel.toLowerCase())) {
        fields.push({
          name: fkCamel,
          dartType: 'String',
          jsonKey: fkCamel,
          isId: false,
          isNullable: true,
          isDateTime: false,
          isNumber: false,
          isBoolean: false,
          isString: true,
          defaultValue: "''",
          refClassName: rel.targetClassName,
        });
      }
    }
  }

  // Relaciones M:N del lado dueño: lista de ids, igual que en los DTOs del backend
  for (const rel of meta.relationships || []) {
    if (rel.type === 'MANY_TO_MANY' && rel.isOwner && rel.idsFieldName) {
      fields.push({
        name: rel.idsFieldName,
        dartType: 'List<String>',
        jsonKey: rel.idsFieldName,
        isId: false,
        isNullable: true,
        isDateTime: false,
        isNumber: false,
        isBoolean: false,
        isString: false,
        defaultValue: 'const []',
        isIdList: true,
        refClassName: rel.targetClassName,
      });
    }
  }

  return fields;
}

export function getPluralName(name: string): string {
  if (name.endsWith('s') || name.endsWith('x') || name.endsWith('z')) {
    return name + 'es';
  }
  return name + 's';
}
