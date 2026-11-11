import { UmlClassNode, UmlConnection } from './uml-diagram.types';
import { findNodeFuzzy, normalizeForFuzzy } from './node-matching';

type Attribute = UmlClassNode['attributes'][number];
type Method = UmlClassNode['methods'][number];

/** Operación de edición que devuelve el modelo (ver MENTOR_INSTRUCTION). */
export type DiagramOperation =
  | {
      op: 'add_class';
      name: string;
      attributes?: Attribute[];
      methods?: Method[];
    }
  | {
      op: 'update_class';
      target: string;
      rename?: string;
      attributes?: Attribute[];
      addAttributes?: Attribute[];
      removeAttributes?: string[];
      updateAttributes?: { name: string; newName?: string; type?: string }[];
      clearAttributes?: boolean;
      methods?: Method[];
      addMethods?: Method[];
      removeMethods?: string[];
      clearMethods?: boolean;
    }
  | { op: 'remove_class'; target: string }
  | RelationOperation<'add_relation'>
  | RelationOperation<'update_relation'>
  | { op: 'remove_relation'; source: string; target: string }
  | { op: 'clear_diagram' };

interface RelationOperation<T extends string> {
  op: T;
  source: string;
  target: string;
  type?: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export interface ApplyResult {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  /** Operaciones que no se pudieron aplicar (p. ej. una clase inexistente). */
  skipped: string[];
}

const ASKS_FOR_RELATIONS =
  /(?:relaci[oó]n|conecta|asocia|cardinalidad|multiplicidad|muchos|uno\s+a|pertenece|tiene|vincula|\*|--)/i;
const SINGLE_CLASS_ADD =
  /(?:crea(?:r)?|agrega(?:r)?|a[ñn]ade(?:r)?|inserta(?:r)?)\s+(?:una\s+|la\s+)?(?:nueva\s+)?(?:tabla|clase|entidad)\s*(?:(?:llamada|denominada|de|para)\s+)?([a-zA-Z0-9_]+)/i;

const uid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Salvaguarda: si el usuario solo pidió crear una clase concreta, descarta las relaciones
 * y las clases adicionales que el modelo haya añadido por su cuenta.
 */
export function dropUnrequestedOperations(
  operations: DiagramOperation[],
  prompt: string,
): DiagramOperation[] {
  const match = prompt.match(SINGLE_CLASS_ADD);
  if (!match || ASKS_FOR_RELATIONS.test(prompt)) return operations;

  const requested = normalizeForFuzzy(match[1]);
  const added = operations.filter((o) => o.op === 'add_class');
  return operations.filter((o) => {
    if (o.op === 'add_relation') return false;
    if (o.op === 'add_class' && added.length > 1)
      return normalizeForFuzzy(o.name) === requested;
    return true;
  });
}

/** Relaciones que no tienen sentido de una clase consigo misma. */
const NO_SELF_RELATION = new Set([
  'generalization',
  'realization',
  'association_class',
]);

const MANY_MULTIPLICITY = /^(?:\*|[01]\.\.\*|[nm]|\d+\.\.[nm*])$/i;
const MANY_WORD =
  /\b(?:much[oa]s?|vari[oa]s?|m[uú]ltiples|many)\b(?:\s+(\p{L}[\p{L}\d_]*))?/giu;
const EXPLICIT_MANY_TO_MANY =
  /(?:much[oa]s?|vari[oa]s?)\s+a\s+(?:much[oa]s?|vari[oa]s?)|\b[nm]\s*[:a]\s*[nm]\b|\*\s*(?:a|:|-+)\s*\*|many[\s-]+to[\s-]+many/i;

/**
 * Salvaguarda: los modelos pequeños convierten «una Categoria tiene muchos productos» en una
 * relación muchos a muchos. Si el mensaje no la pide (ni dice «muchos a muchos» ni menciona
 * «muchos» en los dos sentidos), la relación pasa a uno a muchos: el lado «muchos» es la
 * clase que sigue a «muchos/muchas/varios» en el mensaje.
 */
export function fixUnrequestedManyToMany(
  operations: DiagramOperation[],
  prompt: string,
): DiagramOperation[] {
  const manyMentions = [...prompt.matchAll(MANY_WORD)];
  if (EXPLICIT_MANY_TO_MANY.test(prompt) || manyMentions.length !== 1) {
    return operations;
  }
  const manyWord = normalizeForFuzzy(manyMentions[0][1] || '');
  const isManySide = (className: string) => {
    const name = normalizeForFuzzy(className);
    return (
      !!manyWord &&
      !!name &&
      (manyWord.startsWith(name) || name.startsWith(manyWord))
    );
  };

  return operations.map((o) => {
    if (
      (o.op !== 'add_relation' && o.op !== 'update_relation') ||
      !MANY_MULTIPLICITY.test(o.sourceMultiplicity || '') ||
      !MANY_MULTIPLICITY.test(o.targetMultiplicity || '')
    ) {
      return o;
    }
    const sourceIsMany = isManySide(o.source);
    const targetIsMany = isManySide(o.target);
    if (sourceIsMany === targetIsMany) return o;
    return sourceIsMany
      ? { ...o, targetMultiplicity: '1' }
      : { ...o, sourceMultiplicity: '1' };
  });
}

/** Aplica las operaciones sobre una copia del diagrama. */
export function applyOperations(
  currentNodes: UmlClassNode[],
  currentConnections: UmlConnection[],
  operations: DiagramOperation[],
): ApplyResult {
  const nodes = new Map(currentNodes.map((n) => [n.id, cloneNode(n)]));
  const connections = new Map(currentConnections.map((c) => [c.id, { ...c }]));
  const skipped: string[] = [];

  const classes = () => Array.from(nodes.values()).filter((n) => !n.isAnchor);
  const findClass = (name?: string) =>
    name ? findNodeFuzzy(classes(), name) : undefined;
  const endpoints = (c: UmlConnection) => [
    nodeIdOf(c.sourceNodeId, c.sourceId),
    nodeIdOf(c.targetNodeId, c.targetId),
  ];

  const findRelation = (a: UmlClassNode, b: UmlClassNode) => {
    for (const c of connections.values()) {
      if (c.type === 'association_class') continue;
      const [s, t] = endpoints(c);
      if (s === a.id && t === b.id) return { conn: c, reversed: false };
      if (s === b.id && t === a.id) return { conn: c, reversed: true };
    }
    return undefined;
  };

  /** Quita la tabla intermedia, el ancla y el conector «link» de una relación M:N. */
  const dropAssociationClass = (conn: UmlConnection) => {
    const anchorId = conn.assocAnchorNodeId;
    for (const n of Array.from(nodes.values())) {
      if (n.assocMainConnId === conn.id || n.id === anchorId) removeNode(n.id);
    }
    delete conn.assocAnchorNodeId;
  };

  const removeConnection = (conn: UmlConnection) => {
    connections.delete(conn.id);
    dropAssociationClass(conn);
  };

  function removeNode(id: string) {
    if (!nodes.delete(id)) return;
    for (const c of Array.from(connections.values())) {
      const [s, t] = endpoints(c);
      if (s === id || t === id || c.assocAnchorNodeId === id)
        removeConnection(c);
    }
  }

  const nextPosition = () => {
    const right = classes().reduce(
      (max, n) => Math.max(max, n.position.x + (n.width || 220)),
      50,
    );
    return { x: right + 60, y: 80 };
  };

  for (const op of operations) {
    switch (op?.op) {
      case 'clear_diagram':
        nodes.clear();
        connections.clear();
        break;

      case 'add_class': {
        if (!op.name?.trim()) break;
        const existing = findClass(op.name);
        if (
          existing &&
          normalizeForFuzzy(existing.name) === normalizeForFuzzy(op.name)
        ) {
          // El modelo «creó» una clase que ya existe: se fusionan sus miembros
          mergeMembers(existing.attributes, op.attributes);
          mergeMembers(existing.methods, op.methods);
          break;
        }
        const id = uid('node');
        nodes.set(id, {
          id,
          name: op.name.trim(),
          position: nextPosition(),
          width: 220,
          attributes: [...(op.attributes || [])],
          methods: [...(op.methods || [])],
        });
        break;
      }

      case 'update_class': {
        const node = findClass(op.target);
        if (!node) {
          skipped.push(`update_class ${op.target}`);
          break;
        }
        if (op.rename?.trim()) node.name = op.rename.trim();
        if (Array.isArray(op.attributes))
          node.attributes = keepNotation(op.attributes, node.attributes);
        if (op.clearAttributes) node.attributes = [];
        removeMembers(node.attributes, op.removeAttributes);
        for (const change of op.updateAttributes || []) {
          const attr = node.attributes.find((a) =>
            sameName(a.name, change.name || ''),
          );
          if (!attr) continue;
          if (change.newName) attr.name = change.newName;
          if (change.type) attr.type = change.type;
        }
        mergeMembers(node.attributes, op.addAttributes);
        if (Array.isArray(op.methods))
          node.methods = keepNotation(op.methods, node.methods);
        if (op.clearMethods) node.methods = [];
        removeMembers(node.methods, op.removeMethods);
        mergeMembers(node.methods, op.addMethods);
        break;
      }

      case 'remove_class': {
        const node = findClass(op.target);
        if (node) removeNode(node.id);
        else skipped.push(`remove_class ${op.target}`);
        break;
      }

      case 'add_relation':
      case 'update_relation': {
        const source = findClass(op.source);
        const target = findClass(op.target);
        // Una clase solo se relaciona consigo misma si el modelo la nombró igual en los dos
        // extremos (no por un parecido de nombres) y nunca por herencia o realización
        const isSelf = !!source && source.id === target?.id;
        const selfAllowed =
          isSelf &&
          normalizeForFuzzy(op.source) === normalizeForFuzzy(op.target) &&
          !NO_SELF_RELATION.has(op.type || '');
        if (!source || !target || (isSelf && !selfAllowed)) {
          skipped.push(`${op.op} ${op.source} → ${op.target}`);
          break;
        }
        const found = findRelation(source, target);
        if (!found && op.op === 'update_relation') {
          skipped.push(`update_relation ${op.source} → ${op.target}`);
          break;
        }
        const conn: UmlConnection = found?.conn || {
          id: uid('conn'),
          sourceNodeId: source.id,
          targetNodeId: target.id,
          sourceId: `${source.id}_${isSelf ? 'top' : 'right'}`,
          targetId: `${target.id}_${isSelf ? 'right' : 'left'}`,
          type: 'association',
          sourceMultiplicity: '',
          targetMultiplicity: '',
        };
        // Si la relación existente va en sentido contrario, las multiplicidades se cruzan
        const [sourceMult, targetMult] = found?.reversed
          ? [op.targetMultiplicity, op.sourceMultiplicity]
          : [op.sourceMultiplicity, op.targetMultiplicity];
        if (op.type) conn.type = op.type;
        if (op.name !== undefined) conn.name = op.name;
        if (sourceMult !== undefined) conn.sourceMultiplicity = sourceMult;
        if (targetMult !== undefined) conn.targetMultiplicity = targetMult;
        // Una relación que deja de ser muchos a muchos pierde su tabla intermedia
        if (
          conn.assocAnchorNodeId &&
          !(isMany(conn.sourceMultiplicity) && isMany(conn.targetMultiplicity))
        ) {
          dropAssociationClass(conn);
        }
        connections.set(conn.id, conn);
        break;
      }

      case 'remove_relation': {
        const source = findClass(op.source);
        const target = findClass(op.target);
        const found =
          source && target ? findRelation(source, target) : undefined;
        if (found) removeConnection(found.conn);
        else skipped.push(`remove_relation ${op.source} → ${op.target}`);
        break;
      }

      default:
        skipped.push(`operación desconocida ${(op as { op?: string })?.op}`);
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    connections: Array.from(connections.values()),
    skipped,
  };
}

function cloneNode(n: UmlClassNode): UmlClassNode {
  return {
    ...n,
    position: { ...n.position },
    attributes: (n.attributes || []).map((a) => ({ ...a })),
    methods: (n.methods || []).map((m) => ({ ...m })),
  };
}

function nodeIdOf(
  nodeId: string | undefined,
  handleId: string | undefined,
): string {
  return nodeId || (handleId || '').replace(/_(top|bottom|left|right)$/, '');
}

function isMany(mult?: string): boolean {
  const clean = (mult || '').trim().toLowerCase();
  return (
    clean.includes('*') ||
    clean.includes('n') ||
    clean.includes('m') ||
    clean === 'many'
  );
}

/**
 * Lista de miembros que reemplaza a la anterior: el modelo no conoce la visibilidad, así que
 * cada miembro que ya existía conserva la suya.
 */
function keepNotation<T extends { name: string; visibility?: string }>(
  next: T[],
  previous: T[],
): T[] {
  return next.map((item) => {
    const old = previous.find((m) => sameName(m.name, item?.name || ''));
    return old?.visibility && !item.visibility
      ? { ...item, visibility: old.visibility }
      : { ...item };
  });
}

/** Añade miembros nuevos; si ya existe uno con ese nombre, se actualiza. */
function mergeMembers<T extends { name: string }>(
  list: T[],
  additions?: T[],
): void {
  for (const item of additions || []) {
    if (!item?.name) continue;
    const index = list.findIndex((m) => sameName(m.name, item.name));
    if (index >= 0) list[index] = { ...list[index], ...item };
    else list.push({ ...item });
  }
}

function removeMembers<T extends { name: string }>(
  list: T[],
  names?: string[],
): void {
  for (const name of names || []) {
    const index = list.findIndex((m) => sameName(m.name, name));
    if (index >= 0) list.splice(index, 1);
  }
}
