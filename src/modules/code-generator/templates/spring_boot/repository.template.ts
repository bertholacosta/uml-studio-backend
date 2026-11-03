import * as path from 'path';
import { JavaClassMeta } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderRepository(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'repository.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const idType = meta.idField.javaType;
  const imports = [
    'java.util.UUID',
    `${meta.basePackage}.entities.${meta.className}`,
    'org.springframework.data.jpa.repository.JpaRepository',
    'org.springframework.stereotype.Repository',
  ];

  const uniqueImports = Array.from(new Set(imports)).sort();

  const queryMethods = meta.fields
    .filter(
      (f) =>
        !f.isId &&
        (f.isUnique ||
          f.name.toLowerCase() === 'nombre' ||
          f.name.toLowerCase() === 'codigo' ||
          f.name.toLowerCase() === 'email' ||
          f.name.toLowerCase() === 'username' ||
          f.name.toLowerCase() === 'usuario' ||
          f.name.toLowerCase() === 'correo'),
    )
    .map((f) => {
      const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      return `java.util.Optional<${meta.className}> findBy${cap}(${f.javaType} ${f.name})`;
    });

  return renderMustache(mustacheTemplate, {
    basePackage: meta.basePackage,
    className: meta.className,
    idType,
    imports: uniqueImports,
    queryMethods,
  });
}
