import { normalizeForFuzzy } from './node-matching';

export interface DiagramCreationRequest {
  /** Nombre del diagrama nuevo (el que se indicó o el tema del que trata). */
  name: string;
  /** El mensaje dice qué debe contener: además de crearlo, Trazo diseña su contenido. */
  design: boolean;
  /** «Arma el diagrama de ventas»: si ya existe uno con ese nombre, se habla de ese. */
  definite: boolean;
}

export const DEFAULT_DIAGRAM_NAME = 'Nuevo diagrama';
const MAX_NAME_LENGTH = 60;

const NOT_WORD_BEFORE = '(?<![\\p{L}\\d_])';
const NOT_WORD_AFTER = '(?![\\p{L}\\d_])';
const VERBS = [
  'cr[eé]a(?:r|me|nos)?',
  'crees?',
  'haz(?:me|nos)?',
  'hacer',
  'hagas?',
  'genera(?:r|me|nos)?',
  'gen[eé]rame',
  'generes?',
  'arma(?:r|me|nos)?',
  '[aá]rmame',
  'armes?',
  'dise[nñ]a(?:r|me|nos)?',
  'dis[eé][nñ]ame',
  'dise[nñ]es?',
  'dibuja(?:r|me|nos)?',
  'prepara(?:r|me|nos)?',
  'construye(?:me)?',
  'construir',
  'quiero',
  'queremos',
  'necesito',
  'necesitamos',
  'nuevo',
].join('|');

const REQUEST = new RegExp(
  `${NOT_WORD_BEFORE}(${VERBS})${NOT_WORD_AFTER}\\s+` +
    '(?:(un|una|otro|otra|el|la|mi|nuestro)\\s+)?' +
    '(?:(?:nuevo|nueva|segundo|segunda)\\s+)?' +
    `(?:diagrama|lienzo)${NOT_WORD_AFTER}(.*)$`,
  'isu',
);
/** Preguntas sobre cómo se hace y negaciones: no piden crear nada. */
const HOW_TO_OR_NEGATED =
  /(?:(?<![\p{L}\d_])(?:c[oó]mo|por\s+qu[eé]|para\s+qu[eé]|cu[aá]ndo|d[oó]nde)(?![\p{L}\d_]).*|(?<![\p{L}\d_])no\s+(?:me\s+|nos\s+)?)$/isu;

const CLASS_DIAGRAM_WORDS =
  /^[\s:,-]*(?:(?:uml|nuevo|nueva)(?![\p{L}\d_])\s*|de\s+clases?(?![\p{L}\d_])\s*)+/iu;
const QUOTED_NAME = /["«“'‘]([^"»”'’\n]+)["»”'’]/u;
const TAGGED_NAME = /#([\p{L}\d_-]+)/u;
const NAMED =
  /(?:llamad[oa]|titulad[oa]|que\s+se\s+llame|de\s+nombre|con\s+(?:el\s+)?nombre(?:\s+de)?)\s+([^.,;:!?\n]+)/iu;
const TOPIC =
  /^[\s:,-]*(?:del?|para|sobre)\s+(?:(?:un|una|unos|unas|el|la|los|las|mi|nuestro|nuestra)\s+)?([^.,;:!?\n]+)/iu;
/** Lo que sigue al nombre ya es contenido: «de ventas con Cliente y Pedido». */
const NAME_END =
  /\s+(?:con|que|donde|en\s+el\s+que|el\s+cual|incluyendo|y\s+agrega)(?![\p{L}\d_]).*$/isu;

function cleanName(raw: string): string {
  const name = raw
    .replace(NAME_END, '')
    .replace(/[-_]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : '';
}

/** Lo que queda del mensaje tras quitar el nombre: si hay algo, describe el contenido. */
function hasContent(rest: string, match: RegExpMatchArray): boolean {
  const remaining =
    rest.slice(0, match.index) + rest.slice(match.index! + match[0].length);
  return /[\p{L}\d]/u.test(remaining);
}

/**
 * Reconoce un pedido de diagrama nuevo («crea un diagrama para un e-commerce», «quiero otro
 * lienzo llamado Pagos»). Lo decide el código y no el modelo: un modelo pequeño tiende a
 * responder que no puede. Devuelve null si el mensaje habla de otra cosa.
 */
export function diagramCreationRequest(
  text: string,
): DiagramCreationRequest | null {
  const clean = text.replace(/@trazo(?![\p{L}\d_])/giu, ' ').trim();
  const match = clean.match(REQUEST);
  if (!match || HOW_TO_OR_NEGATED.test(clean.slice(0, match.index))) {
    return null;
  }
  const definite = /^(?:el|la|mi|nuestro)$/i.test(match[2] || '');
  const rest = match[3].replace(CLASS_DIAGRAM_WORDS, '');

  for (const pattern of [QUOTED_NAME, TAGGED_NAME, NAMED]) {
    const named = rest.match(pattern);
    const name = named && cleanName(named[1]);
    if (name) {
      const tail = pattern === NAMED ? named[1].match(NAME_END) : null;
      return { name, design: !!tail || hasContent(rest, named), definite };
    }
  }

  const topic = rest.match(TOPIC);
  const name = topic && cleanName(topic[1]);
  if (name) return { name, design: true, definite };
  return {
    name: DEFAULT_DIAGRAM_NAME,
    design: /[\p{L}\d]/u.test(rest),
    definite,
  };
}

/** Evita repetir un nombre del proyecto: «Ventas», «Ventas 2», «Ventas 3»… */
export function uniqueDiagramName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => normalizeForFuzzy(n)));
  if (!taken.has(normalizeForFuzzy(name))) return name;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} ${n}`;
    if (!taken.has(normalizeForFuzzy(candidate))) return candidate;
  }
}
