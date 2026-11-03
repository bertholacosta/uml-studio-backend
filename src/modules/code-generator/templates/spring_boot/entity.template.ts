import * as path from 'path';
import { JavaClassMeta } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderEntity(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'entity.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  // 1. Resolver imports
  const importsSet = new Set<string>([
    'java.util.UUID',
    'jakarta.persistence.*',
    'jakarta.validation.constraints.*',
  ]);
  if (meta.hasBigDecimals) importsSet.add('java.math.BigDecimal');
  if (meta.hasDates) {
    importsSet.add('java.time.LocalDate');
    importsSet.add('java.time.LocalDateTime');
  }
  if (
    meta.relationships.some(
      (r) => r.type === 'ONE_TO_MANY' || r.type === 'MANY_TO_MANY',
    )
  ) {
    importsSet.add('java.util.List');
    importsSet.add('java.util.ArrayList');
    importsSet.add('com.fasterxml.jackson.annotation.JsonIgnore');
    importsSet.add('lombok.Builder');
  }
  const sortedImports = Array.from(importsSet).sort();

  // 2. Procesar campos con flags booleanos
  // Se excluyen los campos marcados como clave foránea o que coincidan con un @JoinColumn
  // para evitar que Hibernate lance MappingException por duplicidad de columnas en el mapeo JPA.
  const nonFkFields = meta.fields.filter(
    (field) =>
      !field.isForeignKey &&
      !meta.relationships.some(
        (r) =>
          (r.type === 'MANY_TO_ONE' || r.type === 'ONE_TO_ONE') &&
          r.joinColumnName?.toLowerCase() === field.sqlColumnName.toLowerCase(),
      ),
  );

  const processedFields = nonFkFields.map((field) => ({
    ...field,
    isId: field.isId,
    genStrategy:
      field.javaType === 'UUID'
        ? 'GenerationType.UUID'
        : 'GenerationType.IDENTITY',
    isNotBlank: !field.isId && !field.isNullable && field.javaType === 'String',
    isNotNull: !field.isId && !field.isNullable && field.javaType !== 'String',
  }));

  // 3. Procesar relaciones
  const processedRelationships = meta.relationships.map((rel) => {
    const isCollection =
      rel.type === 'ONE_TO_MANY' || rel.type === 'MANY_TO_MANY';
    return {
      ...rel,
      tableName: meta.tableName,
      isManyToOne: rel.type === 'MANY_TO_ONE',
      isOneToMany: rel.type === 'ONE_TO_MANY',
      isOneToOne: rel.type === 'ONE_TO_ONE',
      isManyToManyOwner: rel.type === 'MANY_TO_MANY' && rel.isOwner,
      isManyToManyInverse: rel.type === 'MANY_TO_MANY' && !rel.isOwner,
      capFieldName:
        rel.fieldName.charAt(0).toUpperCase() + rel.fieldName.slice(1),
      renderType: isCollection
        ? `List<${rel.targetClassName}>`
        : rel.targetClassName,
    };
  });

  // 4. Modelo de vista
  const reservedSqlKeywords = new Set([
    'order',
    'user',
    'group',
    'table',
    'select',
    'where',
    'from',
    'limit',
    'offset',
    'key',
    'value',
    'case',
    'check',
    'all',
    'any',
    'column',
    'by',
    'asc',
    'desc',
  ]);
  const isReserved = reservedSqlKeywords.has(meta.tableName.toLowerCase());
  const tableName = isReserved ? `\\"${meta.tableName}\\"` : meta.tableName;

  const viewContext = {
    basePackage: meta.basePackage,
    tableName,
    className: meta.className,
    imports: sortedImports,
    processedFields,
    processedRelationships,
    isInheritanceRoot: !!meta.isInheritanceRoot,
    parentClassName: meta.parentClassName,
    idColumnName: meta.idField.sqlColumnName,
  };

  return renderMustache(mustacheTemplate, viewContext);
}
