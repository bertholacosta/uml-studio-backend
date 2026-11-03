import * as path from 'path';
import { JavaClassMeta } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderController(meta: JavaClassMeta): string {
  const templatePath = path.join(__dirname, 'controller.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const idType = meta.idField.javaType;
  const endpointPath = meta.tableName.replace(/_/g, '-');
  const imports = [
    'java.util.UUID',
    'java.util.List',
    'jakarta.validation.Valid',
    'org.springframework.http.HttpStatus',
    'org.springframework.http.ResponseEntity',
    'org.springframework.web.bind.annotation.*',
    'io.swagger.v3.oas.annotations.Operation',
    'io.swagger.v3.oas.annotations.tags.Tag',
    'io.swagger.v3.oas.annotations.responses.ApiResponse',
    'io.swagger.v3.oas.annotations.responses.ApiResponses',
    `${meta.basePackage}.dtos.Create${meta.className}Dto`,
    `${meta.basePackage}.dtos.Update${meta.className}Dto`,
    `${meta.basePackage}.dtos.${meta.className}ResponseDto`,
    `${meta.basePackage}.services.${meta.className}Service`,
  ];

  const uniqueImports = Array.from(new Set(imports)).sort();

  return renderMustache(mustacheTemplate, {
    basePackage: meta.basePackage,
    className: meta.className,
    endpointPath,
    idType,
    imports: uniqueImports,
  });
}
