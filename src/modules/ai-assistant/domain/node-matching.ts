import { UmlClassNode } from './uml-diagram.types';

/** Normaliza un nombre para compararlo de forma tolerante (CamelCase, tildes, plurales y palabras vacías). */
export function normalizeForFuzzy(text: string): string {
  if (!text) return '';

  // Separar CamelCase (ej: "DetalleCompra" -> "Detalle Compra")
  const spacedCamel = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  const stopwords = new Set([
    'de',
    'la',
    'el',
    'los',
    'las',
    'del',
    'un',
    'una',
    'unos',
    'unas',
    'tabla',
    'tablas',
    'clase',
    'clases',
    'entidad',
    'entidades',
    'nodo',
    'nodos',
  ]);

  const words = spacedCamel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/);

  const stemmedWords = words
    .filter((w) => w.length > 0 && !stopwords.has(w))
    .map((w) => {
      if (/[aeiou]s$/i.test(w) && w.length > 3) return w.slice(0, -1);
      if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
      return w;
    });

  return stemmedWords.join('');
}

/** Busca un nodo por id, nombre exacto o nombre aproximado. */
export function findNodeFuzzy(
  nodes: UmlClassNode[],
  query: string,
): UmlClassNode | undefined {
  if (!query) return undefined;
  const cleanQuery = normalizeForFuzzy(query);
  if (!cleanQuery) return undefined;

  // 1. Coincidencia por ID
  const byId = nodes.find(
    (n) => n.id.toLowerCase() === query.toLowerCase().trim(),
  );
  if (byId) return byId;

  // 2. Coincidencia exacta normalizada
  const byNormalized = nodes.find(
    (n) => normalizeForFuzzy(n.name) === cleanQuery,
  );
  if (byNormalized) return byNormalized;

  // 3. Coincidencia por prefijo/raíz SOLO si la diferencia de longitud es mínima (<= 2 caracteres, ej: género o inflexión)
  // NUNCA coincidir si es una tabla compuesta o intermedia (ej: "Usuario_Products" NO es "Usuario")
  return nodes.find((n) => {
    const nodeNorm = normalizeForFuzzy(n.name);
    if (nodeNorm.length < 3 || cleanQuery.length < 3) return false;
    const lenDiff = Math.abs(nodeNorm.length - cleanQuery.length);
    return (
      lenDiff <= 2 &&
      (nodeNorm.startsWith(cleanQuery) || cleanQuery.startsWith(nodeNorm))
    );
  });
}
