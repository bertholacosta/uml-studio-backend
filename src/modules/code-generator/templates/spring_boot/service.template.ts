import * as path from 'path';
import {
  JavaClassMeta,
  hasPasswordField,
  getUserPasswordField,
} from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';
import { buildManyToManyIdFields } from './dto.template';

export function renderService(meta: JavaClassMeta, hasAuth = false): string {
  const templatePath = path.join(__dirname, 'service.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const idType = meta.idField.javaType;
  const isAuthProtected = hasAuth && hasPasswordField(meta);
  const passField = isAuthProtected ? getUserPasswordField(meta) : null;

  const imports = [
    'java.util.UUID',
    'java.util.List',
    'java.util.stream.Collectors',
    'org.springframework.stereotype.Service',
    'org.springframework.transaction.annotation.Transactional',
    `${meta.basePackage}.entities.${meta.className}`,
    `${meta.basePackage}.repositories.${meta.className}Repository`,
    `${meta.basePackage}.dtos.Create${meta.className}Dto`,
    `${meta.basePackage}.dtos.Update${meta.className}Dto`,
    `${meta.basePackage}.dtos.${meta.className}ResponseDto`,
    `${meta.basePackage}.exceptions.ResourceNotFoundException`,
  ];

  if (isAuthProtected) {
    imports.push(
      'org.springframework.security.crypto.password.PasswordEncoder',
    );
  }

  for (const rel of meta.relationships) {
    if (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE') {
      imports.push(`${meta.basePackage}.entities.${rel.targetClassName}`);
    }
  }

  // M:N del lado dueño: se resuelven los ids recibidos con el repositorio del destino
  const m2mFields = buildManyToManyIdFields(meta);
  if (m2mFields.length) imports.push('java.util.ArrayList');
  for (const m of m2mFields) {
    imports.push(
      `${meta.basePackage}.repositories.${m.targetClassName}Repository`,
    );
  }
  const m2mAssignments = m2mFields.map(
    (m) =>
      `        if (dto.get${m.capIdsFieldName}() != null) {\n            entity.set${m.capFieldName}(new ArrayList<>(${m.repositoryField}.findAllById(dto.get${m.capIdsFieldName}())));\n        }`,
  );

  const uniqueImports = Array.from(new Set(imports)).sort();

  const isFkField = (f: any) =>
    f.isForeignKey ||
    meta.relationships.some(
      (r) =>
        (r.type === 'MANY_TO_ONE' || r.type === 'ONE_TO_ONE') &&
        r.joinColumnName?.toLowerCase() === f.sqlColumnName.toLowerCase(),
    );

  const regularFields = meta.fields.filter((f) => !f.isId && !isFkField(f));

  const regularCreateAssignments = regularFields.map((f) => {
    if (passField && f.name.toLowerCase() === passField.name.toLowerCase()) {
      return `        entity.${f.setterName}(passwordEncoder.encode(dto.${f.getterName}()));`;
    }
    return `        entity.${f.setterName}(dto.${f.getterName}());`;
  });

  const relCreateAssignments = meta.relationships
    .filter((r) => r.type === 'MANY_TO_ONE' || r.type === 'ONE_TO_ONE')
    .map((r) => {
      const capName =
        r.fieldName.charAt(0).toUpperCase() + r.fieldName.slice(1);
      const setter = r.targetIdSetterName || 'setId';
      return `        if (dto.get${capName}Id() != null) {\n            ${r.targetClassName} ${r.fieldName} = new ${r.targetClassName}();\n            ${r.fieldName}.${setter}(dto.get${capName}Id());\n            entity.set${capName}(${r.fieldName});\n        }`;
    });

  const createFieldAssignments = [
    ...regularCreateAssignments,
    ...relCreateAssignments,
    ...m2mAssignments,
  ].join('\n');

  const regularUpdateAssignments = regularFields.map((f) => {
    if (passField && f.name.toLowerCase() === passField.name.toLowerCase()) {
      return `        if (dto.${f.getterName}() != null && !dto.${f.getterName}().isBlank()) {\n            entity.${f.setterName}(passwordEncoder.encode(dto.${f.getterName}()));\n        }`;
    }
    return `        if (dto.${f.getterName}() != null) {\n            entity.${f.setterName}(dto.${f.getterName}());\n        }`;
  });

  const relUpdateAssignments = meta.relationships
    .filter((r) => r.type === 'MANY_TO_ONE' || r.type === 'ONE_TO_ONE')
    .map((r) => {
      const capName =
        r.fieldName.charAt(0).toUpperCase() + r.fieldName.slice(1);
      const setter = r.targetIdSetterName || 'setId';
      return `        if (dto.get${capName}Id() != null) {\n            ${r.targetClassName} ${r.fieldName} = new ${r.targetClassName}();\n            ${r.fieldName}.${setter}(dto.get${capName}Id());\n            entity.set${capName}(${r.fieldName});\n        }`;
    });

  const updateFieldAssignments = [
    ...regularUpdateAssignments,
    ...relUpdateAssignments,
    ...m2mAssignments,
  ].join('\n');

  return renderMustache(mustacheTemplate, {
    basePackage: meta.basePackage,
    className: meta.className,
    idType,
    isAuthProtected,
    imports: uniqueImports,
    extraRepositories: m2mFields.map((m) => ({
      type: `${m.targetClassName}Repository`,
      name: m.repositoryField,
    })),
    createFieldAssignments,
    updateFieldAssignments,
  });
}
