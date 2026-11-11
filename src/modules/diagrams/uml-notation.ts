/**
 * Valores de la notación UML que el diagrama guarda como texto: visibilidad de atributos y
 * métodos, y navegabilidad de los extremos de una relación.
 */

export const UML_VISIBILITIES = [
  'public',
  'private',
  'protected',
  'package',
] as const;
export type UmlVisibility = (typeof UML_VISIBILITIES)[number];

/** En UML un atributo sin indicar suele ser privado y una operación, pública. */
export const DEFAULT_ATTRIBUTE_VISIBILITY: UmlVisibility = 'private';
export const DEFAULT_METHOD_VISIBILITY: UmlVisibility = 'public';

/**
 * Hacia qué extremo se puede navegar: sin indicar (línea sin flechas), hacia el destino, hacia
 * el origen o en ambos sentidos.
 */
export const UML_NAVIGABILITIES = [
  'unspecified',
  'to_target',
  'to_source',
  'both',
] as const;
export type UmlNavigability = (typeof UML_NAVIGABILITIES)[number];

/** Largo máximo del nombre de rol de un extremo. */
export const MAX_ROLE_LENGTH = 100;

const VISIBILITY_SYMBOLS: Record<string, UmlVisibility> = {
  '+': 'public',
  '-': 'private',
  '−': 'private',
  '#': 'protected',
  '~': 'package',
};

/** Acepta la palabra («Private», «public») o el símbolo UML («#»); si no la reconoce, usa `fallback`. */
export function normalizeVisibility(
  raw: unknown,
  fallback: UmlVisibility,
): UmlVisibility {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if ((UML_VISIBILITIES as readonly string[]).includes(clean))
    return clean as UmlVisibility;
  return VISIBILITY_SYMBOLS[clean] || fallback;
}

export function normalizeNavigability(raw: unknown): UmlNavigability {
  return typeof raw === 'string' &&
    (UML_NAVIGABILITIES as readonly string[]).includes(raw)
    ? (raw as UmlNavigability)
    : 'unspecified';
}

/** La navegabilidad vista desde el otro extremo (al invertir el sentido de la relación). */
export function reverseNavigability(value: UmlNavigability): UmlNavigability {
  if (value === 'to_target') return 'to_source';
  if (value === 'to_source') return 'to_target';
  return value;
}

/** Nombre de rol limpio, o undefined si está vacío. */
export function normalizeRole(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw.trim().slice(0, MAX_ROLE_LENGTH);
  return clean || undefined;
}
