import { UmlClassNode, UmlConnection } from './uml-diagram.types';

export interface CanvasState {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
}

const SIDE_SUFFIX = /(?:_(?:top|bottom|left|right)|__box)$/;
const endpoint = (nodeId: string | undefined, connectorId: string) =>
  nodeId || connectorId.replace(SIDE_SUFFIX, '');
const lower = (text: string) => text.trim().toLowerCase();

type Member = { name: string };

/**
 * Deshace en una lista (atributos o métodos) lo que cambió de `before` a `after`: quita lo que
 * se añadió, recupera lo que se quitó y devuelve lo que se modificó a como estaba. Lo que el
 * equipo tocó después y Trazo no, se queda.
 */
function revertMembers<T extends Member>(
  current: T[],
  before: T[],
  after: T[],
): T[] {
  const old = new Map(before.map((m) => [lower(m.name), m]));
  const made = new Map(after.map((m) => [lower(m.name), m]));
  const result = current
    .filter((m) => !(made.has(lower(m.name)) && !old.has(lower(m.name))))
    .map((m) => {
      const previous = old.get(lower(m.name));
      const changed = made.get(lower(m.name));
      return previous &&
        changed &&
        JSON.stringify(previous) !== JSON.stringify(changed)
        ? previous
        : m;
    });
  // Lo que se quitó vuelve a su sitio: tras el miembro que lo precedía antes
  before.forEach((m, i) => {
    const key = lower(m.name);
    if (made.has(key) || result.some((r) => lower(r.name) === key)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const prev = result.findIndex(
        (r) => lower(r.name) === lower(before[j].name),
      );
      if (prev >= 0) {
        at = prev + 1;
        break;
      }
    }
    result.splice(at, 0, m);
  });
  return result;
}

/**
 * Deshace un cambio de Trazo sobre el diagrama actual: solo lo que Trazo tocó (de `before` a
 * `after`), sin pisar lo que el equipo cambió después en otras clases o relaciones.
 */
export function revertChange(
  current: CanvasState,
  before: CanvasState,
  after: CanvasState,
): CanvasState {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));

  // Clases: fuera las que añadió Trazo; las que cambió vuelven a su nombre y miembros
  const nodes = current.nodes
    .filter((n) => !(afterNodes.has(n.id) && !beforeNodes.has(n.id)))
    .map((n) => {
      const previous = beforeNodes.get(n.id);
      const changed = afterNodes.get(n.id);
      if (!previous || !changed || n.isAnchor) return n;
      return {
        ...n,
        name:
          changed.name !== previous.name && n.name === changed.name
            ? previous.name
            : n.name,
        attributes: revertMembers(
          n.attributes,
          previous.attributes,
          changed.attributes,
        ),
        methods: revertMembers(n.methods, previous.methods, changed.methods),
      };
    });
  // Las que quitó Trazo vuelven
  const present = new Set(nodes.map((n) => n.id));
  for (const node of before.nodes) {
    if (!afterNodes.has(node.id) && !present.has(node.id)) nodes.push(node);
  }

  const beforeConns = new Map(before.connections.map((c) => [c.id, c]));
  const afterConns = new Map(after.connections.map((c) => [c.id, c]));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const connects = (c: UmlConnection) =>
    nodeIds.has(endpoint(c.sourceNodeId, c.sourceId)) &&
    nodeIds.has(endpoint(c.targetNodeId, c.targetId));

  const connections = current.connections
    .filter((c) => !(afterConns.has(c.id) && !beforeConns.has(c.id)))
    .map((c) => {
      const previous = beforeConns.get(c.id);
      const changed = afterConns.get(c.id);
      return previous &&
        changed &&
        JSON.stringify(previous) !== JSON.stringify(changed)
        ? previous
        : c;
    });
  const presentConns = new Set(connections.map((c) => c.id));
  for (const conn of before.connections) {
    if (!afterConns.has(conn.id) && !presentConns.has(conn.id)) {
      connections.push(conn);
    }
  }
  return { nodes, connections: connections.filter(connects) };
}
