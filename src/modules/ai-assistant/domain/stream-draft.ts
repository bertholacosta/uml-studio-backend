/**
 * Lectura del JSON que el modelo va escribiendo (respuesta en curso), para mostrar a Trazo
 * escribiendo en tiempo real: el texto de "reply" hasta donde llegó y las operaciones que ya
 * están completas.
 */
export interface StreamDraft {
  /** Texto de "reply" escrito hasta ahora. */
  reply: string;
  /** "reply" ya terminó (se cerró la cadena). */
  replyDone: boolean;
  /** El modelo ya está escribiendo la lista de operaciones. */
  inOperations: boolean;
  /** Operaciones completas hasta ahora. */
  operations: Record<string, unknown>[];
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/** Decodifica una cadena JSON que empieza en `start` (tras la comilla) aunque esté cortada. */
function readString(
  json: string,
  start: number,
): { value: string; closed: boolean } {
  let value = '';
  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (ch === '"') return { value, closed: true };
    if (ch !== '\\') {
      value += ch;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) break; // escape cortado: se espera al siguiente trozo
    if (next === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      value += ESCAPES[next] ?? next;
      i += 1;
    }
  }
  return { value, closed: false };
}

/** Objetos completos de primer nivel dentro de un array JSON que empieza en `start`. */
function completeObjects(
  json: string,
  start: number,
): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        try {
          objects.push(JSON.parse(json.slice(objectStart, i + 1)));
        } catch {
          // objeto malformado: se ignora en el borrador
        }
        objectStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return objects;
}

export function readStreamDraft(json: string): StreamDraft {
  const reply = /"reply"\s*:\s*"/.exec(json);
  const { value, closed } = reply
    ? readString(json, reply.index + reply[0].length)
    : { value: '', closed: false };
  const operations = /"operations"\s*:\s*\[/.exec(json);
  return {
    reply: value,
    replyDone: closed,
    inOperations: !!operations,
    operations: operations
      ? completeObjects(json, operations.index + operations[0].length)
      : [],
  };
}
