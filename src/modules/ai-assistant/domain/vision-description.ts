import { UmlClassNode, UmlConnection } from './uml-diagram.types';

/**
 * Digitalización por pasos: el modelo de visión solo DESCRIBE lo dibujado (cajas y líneas con
 * sus multiplicidades y su trazo) y este código construye el diagrama de la app.
 * A un modelo pequeño (8B) le cuesta mucho emitir directamente el formato interno (anclas,
 * conexiones «link», ids…): inventaba tablas y perdía relaciones. Describir es fácil para él.
 *
 * Las clases de asociación se resuelven con una pregunta cerrada por cada línea discontinua:
 * el modelo sí ve el trazo discontinuo, pero suele atribuir mal su extremo (lo pega a una caja
 * en vez de al medio de otra línea). Eligiendo entre las líneas reales acierta.
 */

export interface VisionRelation {
  from: string;
  to: string;
  fromMultiplicity?: string;
  toMultiplicity?: string;
  type?: string;
  /** «dashed»: trazo discontinuo (clase de asociación o dependencia). */
  style?: string;
}

export interface VisionDescription {
  classes: { name: string; attributes?: { name: string; type?: string }[] }[];
  relations?: VisionRelation[];
  associationClasses?: { class: string; between: string[] }[];
  message?: string;
}

export const VISION_DESCRIPTION_INSTRUCTION = `
Lees diagramas de clases UML (fotos, bocetos a mano, pizarras o capturas) y describes EXACTAMENTE lo que está dibujado, sin inventar nada.
Responde solo con JSON.
- classes: TODAS las cajas de la imagen (recórrela entera) con su nombre y sus atributos tal como están escritos. No añadas atributos que no estén escritos. "type" solo si está escrito junto al atributo.
- relations: TODAS las líneas, una por una. "from" y "to" son las cajas de sus extremos. "fromMultiplicity" es el número o símbolo escrito junto a la caja "from" y "toMultiplicity" el escrito junto a la caja "to" ("1", "*", "0..1", "0..*", "1..*"; "" si no hay nada). Un "*" o una "x" pequeña junto al extremo significa muchos ("*"). Lee cada extremo por separado: no supongas que los dos son iguales.
  "style": "solid" si es un trazo continuo; "dashed" si son trazos cortos separados (- - - -).
  "type" solo si la línea lo indica: "generalization" (triángulo hueco), "composition" (rombo relleno), "aggregation" (rombo hueco); si no, "association".
- message: una frase breve en español con lo que digitalizaste.
`;

/** Esquema JSON para que el modelo (Ollama) devuelva exactamente esta forma. */
export const VISION_DESCRIPTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['classes', 'relations'],
  properties: {
    classes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'attributes'],
        properties: {
          name: { type: 'string' },
          attributes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
              },
            },
          },
        },
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['from', 'to', 'fromMultiplicity', 'toMultiplicity', 'style'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          fromMultiplicity: { type: 'string' },
          toMultiplicity: { type: 'string' },
          style: { type: 'string', enum: ['solid', 'dashed'] },
          type: { type: 'string' },
        },
      },
    },
    message: { type: 'string' },
  },
};

/** Pregunta cerrada sobre una línea discontinua: ¿qué caja es la clase de asociación y a qué línea llega? */
export interface DashedLineQuestion {
  relation: VisionRelation;
  systemInstruction: string;
  text: string;
  schema: Record<string, unknown>;
  /** Opción → las dos cajas de esa línea continua. */
  lines: Map<string, [string, string]>;
}

const lineLabel = (a: string, b: string) => `${a}-${b}`;

/**
 * Una pregunta por cada línea discontinua que pueda ser una clase de asociación: alguna de
 * sus dos cajas tiene líneas continuas con otras cajas, a cuyo medio podría llegar.
 */
export function dashedLineQuestions(
  desc: VisionDescription,
): DashedLineQuestion[] {
  const solid = (desc.relations || []).filter((r) => r.style !== 'dashed');
  return (desc.relations || [])
    .filter((r) => r.style === 'dashed' && r.from && r.to)
    .flatMap((relation) => {
      const ends = [relation.from, relation.to];
      const lines = new Map<string, [string, string]>();
      for (const r of solid) {
        const touches = [r.from, r.to].some((n) =>
          ends.some((e) => key(e) === key(n)),
        );
        const isSame = [r.from, r.to].every((n) =>
          ends.some((e) => key(e) === key(n)),
        );
        if (touches && !isSame)
          lines.set(lineLabel(r.from, r.to), [r.from, r.to]);
      }
      if (!lines.size) return [];
      const options = [...lines.keys()];
      return [
        {
          relation,
          lines,
          systemInstruction: `Miras un diagrama de clases UML. Hay una línea DISCONTINUA (- - -) cerca de las cajas ${relation.from} y ${relation.to}.
Una línea discontinua une una caja (la clase de asociación) con el MEDIO de una línea continua entre otras dos cajas.
Responde: "associationClass": la caja en el extremo de la línea discontinua que toca una caja; "touchesLine": la línea continua a cuyo medio llega el otro extremo, eligiendo entre las opciones; si no llega al medio de ninguna línea, "ninguna".`,
          text: `Opciones de línea continua: ${options.join(', ')}.`,
          schema: {
            type: 'object',
            required: ['associationClass', 'touchesLine'],
            properties: {
              associationClass: { type: 'string', enum: ends },
              touchesLine: { type: 'string', enum: [...options, 'ninguna'] },
            },
          },
        },
      ];
    });
}

/**
 * Aplica las respuestas: una línea discontinua que llega al medio de otra se convierte en
 * clase de asociación; si no, se queda como dependencia (su significado en UML).
 */
export function applyDashedLineAnswers(
  desc: VisionDescription,
  answers: { question: DashedLineQuestion; answer: any }[],
): VisionDescription {
  const associationClasses = [...(desc.associationClasses || [])];
  const resolved = new Set<VisionRelation>();
  for (const { question, answer } of answers) {
    const between = question.lines.get(answer?.touchesLine);
    const cls = answer?.associationClass;
    if (!between || !cls) continue;
    // La clase de asociación no puede ser una de las dos cajas de la línea a la que llega
    if (between.some((n) => key(n) === key(cls))) continue;
    associationClasses.push({ class: cls, between: [...between] });
    resolved.add(question.relation);
  }
  return {
    ...desc,
    associationClasses,
    relations: (desc.relations || [])
      .filter((r) => !resolved.has(r))
      .map((r) =>
        r.style === 'dashed' && (!r.type || r.type === 'association')
          ? { ...r, type: 'dependency' }
          : r,
      ),
  };
}

/** ¿La respuesta del modelo tiene la forma de descripción (y no la del AST de la app)? */
export function isVisionDescription(parsed: any): parsed is VisionDescription {
  return !!parsed && Array.isArray(parsed.classes);
}

const RELATION_TYPES = new Set([
  'association',
  'generalization',
  'realization',
  'composition',
  'aggregation',
  'dependency',
]);

const key = (name: string) =>
  (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** «IDCliente» → «idCliente»: los bocetos suelen escribir el prefijo en mayúsculas. */
const attributeName = (raw: string) =>
  raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/^ID(?=[A-Za-z])/, 'id') || 'atributo';

/** Tipo de un atributo sin tipo escrito: ids → UUID, fechas → LocalDateTime, resto → String. */
const attributeType = (name: string, written?: string) => {
  if (written?.trim()) return written.trim();
  if (/^id/i.test(name)) return 'UUID';
  if (/fecha|date/i.test(name)) return 'LocalDateTime';
  return 'String';
};

/** Normaliza una multiplicidad leída a mano: «x», «n», «muchos» → «*». */
const multiplicity = (raw?: string) => {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return '';
  if (['x', 'n', 'm', 'muchos', 'many'].includes(value)) return '*';
  return value.replace(/\s+/g, '');
};

const COLUMN_GAP = 300;
const ROW_GAP = 260;
const COLUMNS = 3;

/**
 * Convierte la descripción del modelo en clases y conexiones de la app. Las clases de
 * asociación quedan con la estructura del editor: conexión principal con ancla, nodo ancla
 * y conexión «link» hasta la clase (que conserva sus atributos).
 */
export function diagramFromDescription(desc: VisionDescription): {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
} {
  const nodes: UmlClassNode[] = [];
  const byKey = new Map<string, UmlClassNode>();
  const associationKeys = new Set(
    (desc.associationClasses || []).map((a) => key(a.class)),
  );

  // Las clases normales en cuadrícula; las de asociación se colocan luego bajo su ancla
  let placed = 0;
  for (const cls of desc.classes || []) {
    const name = (cls.name || '').trim();
    if (!name || byKey.has(key(name))) continue;
    const isAssociation = associationKeys.has(key(name));
    const index = isAssociation ? 0 : placed++;
    const node: UmlClassNode = {
      id: `node_${nodes.length + 1}`,
      name,
      position: {
        x: 80 + (index % COLUMNS) * COLUMN_GAP,
        y: 80 + Math.floor(index / COLUMNS) * ROW_GAP,
      },
      width: 220,
      attributes: (cls.attributes || [])
        .filter((a) => a?.name?.trim())
        .map((a) => {
          const attrName = attributeName(a.name);
          return { name: attrName, type: attributeType(attrName, a.type) };
        }),
      methods: [],
    };
    nodes.push(node);
    byKey.set(key(name), node);
  }

  const connections: UmlConnection[] = [];
  const connect = (
    source: UmlClassNode,
    target: UmlClassNode,
    sourceMultiplicity: string,
    targetMultiplicity: string,
    type = 'association',
  ) => {
    const conn: UmlConnection = {
      id: `conn_${connections.length + 1}`,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      sourceId: `${source.id}_right`,
      targetId: `${target.id}_left`,
      type,
      name: `${source.name}_${target.name}`,
      sourceMultiplicity,
      targetMultiplicity,
    };
    connections.push(conn);
    return conn;
  };

  for (const rel of desc.relations || []) {
    const source = byKey.get(key(rel.from));
    const target = byKey.get(key(rel.to));
    if (!source || !target || source === target) continue;
    // Una clase de asociación no se une directamente a las clases de su relación
    if (
      associationKeys.has(key(source.name)) ||
      associationKeys.has(key(target.name))
    ) {
      const assoc = (desc.associationClasses || []).find((a) =>
        [source, target].some((n) => key(a.class) === key(n.name)),
      );
      const pair = new Set((assoc?.between || []).map(key));
      if (pair.has(key(source.name)) || pair.has(key(target.name))) continue;
    }
    const type = RELATION_TYPES.has(rel.type || '') ? rel.type! : 'association';
    connect(
      source,
      target,
      multiplicity(rel.fromMultiplicity),
      multiplicity(rel.toMultiplicity),
      type,
    );
  }

  for (const assoc of desc.associationClasses || []) {
    const cls = byKey.get(key(assoc.class));
    const [a, b] = (assoc.between || []).map((n) => byKey.get(key(n)));
    if (!cls || !a || !b || a === b || cls === a || cls === b) continue;

    // La relación principal entre A y B (si el modelo no la listó, se crea muchos a muchos)
    let main = connections.find(
      (c) =>
        c.type !== 'association_class' &&
        ((c.sourceNodeId === a.id && c.targetNodeId === b.id) ||
          (c.sourceNodeId === b.id && c.targetNodeId === a.id)),
    );
    if (!main) main = connect(a, b, '*', '*');
    if (main.assocAnchorNodeId) continue; // ya tiene clase de asociación

    const anchor: UmlClassNode = {
      id: `anchor_${nodes.length + 1}`,
      name: '',
      position: {
        x: Math.round((a.position.x + b.position.x) / 2),
        y: Math.round((a.position.y + b.position.y) / 2),
      },
      width: 0,
      height: 0,
      isAnchor: true,
      attributes: [],
      methods: [],
    };
    nodes.push(anchor);
    main.assocAnchorNodeId = anchor.id;
    cls.assocMainConnId = main.id;
    cls.position = { x: anchor.position.x - 110, y: anchor.position.y + 120 };
    connections.push({
      id: `conn_${connections.length + 1}`,
      sourceNodeId: anchor.id,
      targetNodeId: cls.id,
      sourceId: anchor.id,
      targetId: `${cls.id}_top`,
      type: 'association_class',
      name: '«link»',
    });
  }

  return { nodes, connections };
}
