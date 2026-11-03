import { UmlClassNode, UmlConnection } from './uml-diagram.types';

/** Interpreta la respuesta JSON del modelo, tolerando bloques ```json. */
export function parseModelJson(text: string): any {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\n/, '').replace(/\n```$/, '');
  }
  return JSON.parse(clean);
}

/**
 * Garantiza que cada nodo tenga `position`: admite el formato del API (`positionX`/`positionY`)
 * y nodos del modelo sin coordenadas, que se reparten en cuadrícula.
 */
export function withPositions(nodes: any[] | undefined): UmlClassNode[] {
  return (nodes || []).filter(Boolean).map((node, index) => {
    if (
      typeof node.position?.x === 'number' &&
      typeof node.position?.y === 'number'
    )
      return node;
    return {
      ...node,
      position: {
        x:
          typeof node.positionX === 'number'
            ? node.positionX
            : 120 + ((index * 260) % 780),
        y:
          typeof node.positionY === 'number'
            ? node.positionY
            : 80 + Math.floor((index * 260) / 780) * 220,
      },
      attributes: node.attributes || [],
      methods: node.methods || [],
    };
  });
}

/** Normaliza tipos, deduplica atributos y métodos y completa ids y posiciones. */
export function sanitizeNodes(nodes: any[]): UmlClassNode[] {
  const validTypes = [
    'UUID',
    'String',
    'Integer',
    'Long',
    'Boolean',
    'Double',
    'Float',
    'BigDecimal',
    'LocalDate',
    'LocalDateTime',
    'Date',
    'Text',
    'byte[]',
  ];

  const normalizeType = (raw: string): string => {
    if (!raw) return 'String';
    const clean = raw.trim().toLowerCase();
    if (clean === 'int') return 'Integer';
    if (clean === 'datetime') return 'LocalDateTime';
    if (clean === 'bool') return 'Boolean';
    if (clean === 'number') return 'Double';
    return validTypes.find((t) => t.toLowerCase() === clean) || 'String';
  };

  return nodes.map((node, index) => {
    // Deduplicar atributos por nombre
    const seenAttrs = new Set<string>();
    const dedupedAttributes: { name: string; type: string }[] = [];
    for (const attr of node.attributes || []) {
      const name = (attr.name || 'attr').trim();
      const lower = name.toLowerCase();
      if (!seenAttrs.has(lower)) {
        seenAttrs.add(lower);
        dedupedAttributes.push({
          name,
          type: normalizeType(attr.type),
        });
      }
    }

    // Deduplicar métodos por nombre + parámetros
    const seenMethods = new Set<string>();
    const dedupedMethods: {
      name: string;
      parameters: string;
      returnType: string;
    }[] = [];
    for (const m of node.methods || []) {
      const key =
        `${(m.name || 'operation').trim()}(${(m.parameters || '').trim()})`.toLowerCase();
      if (!seenMethods.has(key)) {
        seenMethods.add(key);
        dedupedMethods.push({
          name: m.name || 'operation',
          parameters: m.parameters || '',
          returnType: m.returnType || 'void',
        });
      }
    }

    const safeId =
      node.id && typeof node.id === 'string' && node.id.trim() !== ''
        ? node.id.trim()
        : `node_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;

    const posX =
      typeof node.position?.x === 'number'
        ? node.position.x
        : 120 + ((index * 260) % 780);
    const posY =
      typeof node.position?.y === 'number'
        ? node.position.y
        : 80 + Math.floor((index * 260) / 780) * 220;

    return {
      id: safeId,
      name: node.isAnchor ? node.name || '' : node.name || `Class${index + 1}`,
      position: { x: posX, y: posY },
      width: node.isAnchor ? 0 : node.width || node.position?.width || 220,
      height: node.height || undefined,
      isAnchor: node.isAnchor || false,
      assocAnchorNodeId: node.assocAnchorNodeId || undefined,
      assocMainConnId: node.assocMainConnId || undefined,
      attributes: dedupedAttributes,
      methods: dedupedMethods,
    };
  });
}

/** Completa los campos de las conexiones y descarta las que apuntan a nodos inexistentes. */
export function sanitizeConnections(
  connections: any[],
  nodes: UmlClassNode[],
): UmlConnection[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return connections
    .map((conn, index) => {
      const sourceId =
        conn.sourceNodeId ||
        conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const targetId =
        conn.targetNodeId ||
        conn.targetId?.replace(/_(top|bottom|left|right)$/, '');

      return {
        id:
          conn.id ||
          `conn_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        sourceId: conn.sourceId || `${sourceId}_right`,
        targetId: conn.targetId || `${targetId}_left`,
        type: conn.type || 'association',
        name: conn.name || conn.label || undefined,
        sourceMultiplicity:
          conn.sourceMultiplicity || conn.sourceCardinality || '',
        targetMultiplicity:
          conn.targetMultiplicity || conn.targetCardinality || '',
        assocAnchorNodeId: conn.assocAnchorNodeId || undefined,
      };
    })
    .filter(
      (conn) =>
        nodeMap.has(conn.sourceNodeId || '') &&
        nodeMap.has(conn.targetNodeId || ''),
    );
}
