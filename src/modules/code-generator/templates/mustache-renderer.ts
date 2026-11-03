import * as fs from 'fs';
import * as Mustache from 'mustache';

// Desactivar el escape de HTML para que la generación de código (Java, Dart, Groovy, SQL, YAML)
// preserve caracteres como <, >, &, ", etc. de manera nativa.
const renderOptions: Mustache.RenderOptions = {
  escape: (text: string) => text,
};

const templateCache = new Map<string, string>();

/**
 * Carga una plantilla Mustache desde el sistema de archivos (con caché en memoria).
 */
export function loadTemplate(filePath: string): string {
  if (templateCache.has(filePath)) {
    return templateCache.get(filePath)!;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  templateCache.set(filePath, content);
  return content;
}

/**
 * Renderiza una plantilla Mustache con un objeto de datos y parciales opcionales.
 */
export function renderMustache(
  template: string,
  view: Record<string, any>,
  partials?: Record<string, string>,
): string {
  return Mustache.render(template, view, partials, renderOptions);
}
