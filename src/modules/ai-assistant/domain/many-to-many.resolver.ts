import { UmlClassNode, UmlConnection } from './uml-diagram.types';

/**
 * Genera o vincula la tabla asociativa intermedia (con su ancla y conector «link»)
 * para toda relación muchos a muchos del diagrama.
 */
export function resolveManyToManyRelationships(
  nodes: UmlClassNode[],
  connections: UmlConnection[],
): {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  resolvedCount: number;
} {
  const nodeMap = new Map<string, UmlClassNode>(
    nodes.map((n) => [n.id, { ...n }]),
  );
  const connMap = new Map<string, UmlConnection>(
    connections.map((c) => [c.id, { ...c }]),
  );
  let resolvedCount = 0;

  const isMany = (mult?: string): boolean => {
    if (!mult) return false;
    const clean = mult.trim().toLowerCase();
    return (
      clean.includes('*') ||
      clean.includes('n') ||
      clean.includes('m') ||
      clean === 'many'
    );
  };

  const cleanStr = (s: string) =>
    (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const getStems = (name: string): string[] => {
    const c = cleanStr(name);
    if (!c) return [];
    const stems = new Set<string>([c]);
    if (c.endsWith('es') && c.length > 3) stems.add(c.slice(0, -2));
    if (c.endsWith('s') && c.length > 2) stems.add(c.slice(0, -1));
    return Array.from(stems);
  };

  const matchesStem = (targetText: string, stem: string): boolean => {
    if (!stem || !targetText) return false;
    if (stem.length >= 3) return targetText.includes(stem);
    const tokens = targetText.split(/[^a-z0-9]+/);
    return (
      tokens.includes(stem) ||
      targetText.startsWith(stem) ||
      targetText.endsWith(stem)
    );
  };

  for (const conn of Array.from(connMap.values())) {
    const sId =
      conn.sourceNodeId ||
      conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
    const tId =
      conn.targetNodeId ||
      conn.targetId?.replace(/_(top|bottom|left|right)$/, '');

    if (!sId || !tId || sId === tId) continue;
    if (conn.type === 'association_class') continue;

    const sourceNode = nodeMap.get(sId);
    const targetNode = nodeMap.get(tId);

    if (!sourceNode || !targetNode) continue;
    if (sourceNode.isAnchor || targetNode.isAnchor) continue;

    const isMn =
      isMany(conn.sourceMultiplicity) && isMany(conn.targetMultiplicity);
    if (!isMn) continue;

    const sStems = getStems(sourceNode.name);
    const tStems = getStems(targetNode.name);

    // Buscar posibles tablas intermedias existentes para esta relación
    const candidates: { node: UmlClassNode; score: number }[] = [];

    for (const n of nodeMap.values()) {
      if (n.id === sourceNode.id || n.id === targetNode.id || n.isAnchor)
        continue;

      let score = 0;

      // 1. Vinculación directa mediante assocMainConnId
      if (n.assocMainConnId === conn.id) {
        score += 100;
      }

      // 2. Conectado al ancla de la conexión vía association_class
      if (conn.assocAnchorNodeId) {
        const isLinkedToAnchor = Array.from(connMap.values()).some(
          (c) =>
            c.type === 'association_class' &&
            ((c.sourceNodeId === conn.assocAnchorNodeId &&
              (c.targetNodeId === n.id || c.targetId?.startsWith(n.id))) ||
              (c.targetNodeId === conn.assocAnchorNodeId &&
                (c.sourceNodeId === n.id || c.sourceId?.startsWith(n.id)))),
        );
        if (isLinkedToAnchor) score += 90;
      }

      // 3. Conexión tipo association_class que apunta a este nodo
      const hasAssocClassLink = Array.from(connMap.values()).some(
        (c) =>
          c.type === 'association_class' &&
          (c.targetNodeId === n.id ||
            c.targetId?.startsWith(n.id) ||
            c.sourceNodeId === n.id ||
            c.sourceId?.startsWith(n.id)),
      );
      if (hasAssocClassLink) score += 30;

      // 4. Nombre compuesto que incluye raíces de source y target
      const nClean = cleanStr(n.name);
      const hasSourceStem = sStems.some((s) => matchesStem(nClean, s));
      const hasTargetStem = tStems.some((t) => matchesStem(nClean, t));
      if (hasSourceStem && hasTargetStem) {
        score += 70;
      }

      // 5. Nombre del nodo coincide con conn.name
      if (
        conn.name &&
        conn.name !== 'relacion' &&
        !conn.name.startsWith('conn_')
      ) {
        const connNameClean = cleanStr(conn.name);
        if (nClean === connNameClean && nClean.length >= 3) {
          score += 40;
        }
      }

      // 6. Conectado a ambas entidades fuente y destino
      const connectedToSource = Array.from(connMap.values()).some(
        (c) =>
          c.type !== 'association_class' &&
          ((c.sourceNodeId === sourceNode.id && c.targetNodeId === n.id) ||
            (c.targetNodeId === sourceNode.id && c.sourceNodeId === n.id)),
      );
      const connectedToTarget = Array.from(connMap.values()).some(
        (c) =>
          c.type !== 'association_class' &&
          ((c.sourceNodeId === targetNode.id && c.targetNodeId === n.id) ||
            (c.targetNodeId === targetNode.id && c.sourceNodeId === n.id)),
      );
      if (connectedToSource && connectedToTarget) {
        score += 50;
      }

      // 7. Atributos referencian llaves foráneas de ambas tablas
      if (n.attributes && n.attributes.length > 0) {
        const attrNames = n.attributes.map((a) => cleanStr(a.name));
        const hasSourceAttr = attrNames.some((a) =>
          sStems.some((s) => matchesStem(a, s)),
        );
        const hasTargetAttr = attrNames.some((a) =>
          tStems.some((t) => matchesStem(a, t)),
        );
        if (hasSourceAttr && hasTargetAttr) {
          score += 45;
        }
      }

      // Un nodo solo es candidato legítimo a tabla asociativa si está explícitamente vinculado
      // o si su nombre/estructura combina inequívocamente ambas entidades (source y target)
      const isLegitCandidate =
        n.assocMainConnId === conn.id ||
        (hasSourceStem && hasTargetStem) ||
        score >= 90;

      if (isLegitCandidate && score >= 40) {
        candidates.push({ node: n, score });
      }
    }

    // Ordenar: mayor score primero, luego mayor cantidad de atributos (favorecer entidad de dominio sobre stub generado)
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        (b.node.attributes?.length || 0) - (a.node.attributes?.length || 0)
      );
    });

    let assocNode: UmlClassNode;

    if (candidates.length > 0) {
      // Seleccionar el mejor candidato como tabla asociativa
      assocNode = candidates[0].node;
      const alreadyWired =
        assocNode.assocMainConnId === conn.id &&
        conn.assocAnchorNodeId &&
        nodeMap.has(conn.assocAnchorNodeId);

      if (!alreadyWired) {
        resolvedCount++;
      }

      assocNode.assocMainConnId = conn.id;
      nodeMap.set(assocNode.id, assocNode);

      // Si existen candidatos duplicados/redundantes (ej. un stub autogenerado además de la tabla real), podarlos
      if (candidates.length > 1) {
        for (let i = 1; i < candidates.length; i++) {
          const redundant = candidates[i].node;
          // NUNCA podar tablas o entidades de dominio normales: solo podar stubs o duplicados autogenerados de esta misma relación
          const isRedundantStubOfThisRelation =
            redundant.assocMainConnId === conn.id ||
            redundant.id.includes('_assoc') ||
            redundant.id.includes('_stub');

          if (!isRedundantStubOfThisRelation) {
            continue;
          }

          const isConnectedToThirdParty = Array.from(connMap.values()).some(
            (c) =>
              (c.sourceNodeId === redundant.id ||
                c.targetNodeId === redundant.id) &&
              c.sourceNodeId !== sourceNode.id &&
              c.targetNodeId !== sourceNode.id &&
              c.sourceNodeId !== targetNode.id &&
              c.targetNodeId !== targetNode.id &&
              c.sourceNodeId !== conn.assocAnchorNodeId &&
              c.targetNodeId !== conn.assocAnchorNodeId,
          );

          if (!isConnectedToThirdParty) {
            nodeMap.delete(redundant.id);
            for (const c of Array.from(connMap.values())) {
              if (
                c.sourceNodeId === redundant.id ||
                c.targetNodeId === redundant.id ||
                c.sourceId?.startsWith(redundant.id) ||
                c.targetId?.startsWith(redundant.id)
              ) {
                connMap.delete(c.id);
              }
            }
          }
        }
      }
    } else {
      // No existe tabla intermedia previa: sintetizarla
      resolvedCount++;
      const timestamp =
        Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
      const assocNodeId = `node_${timestamp}_assoc`;
      const assocName =
        conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_')
          ? conn.name
          : `${sourceNode.name}_${targetNode.name}`;

      const anchorPosX = Math.round(
        (sourceNode.position.x + targetNode.position.x) / 2,
      );
      const anchorPosY = Math.round(
        (sourceNode.position.y + targetNode.position.y) / 2,
      );

      let assocPosX = Math.max(50, anchorPosX - 110);
      let assocPosY = Math.max(50, anchorPosY + 120);

      const isOccupied = Array.from(nodeMap.values()).some(
        (n) =>
          n.id !== assocNodeId &&
          !n.isAnchor &&
          Math.abs(n.position.x - assocPosX) < 180 &&
          Math.abs(n.position.y - assocPosY) < 120,
      );
      if (isOccupied) {
        assocPosY += 140;
      }

      assocNode = {
        id: assocNodeId,
        name: assocName,
        position: { x: assocPosX, y: assocPosY },
        width: 220,
        attributes: [],
        methods: [],
        assocMainConnId: conn.id,
      };
      nodeMap.set(assocNodeId, assocNode);
    }

    // Sanitizar atributos de la tabla asociativa intermedia:
    // Debe contener ÚNICAMENTE los 2 IDs foráneos correspondientes a sourceNode y targetNode que actúan como clave primaria compuesta.
    // NO debe tener atributo 'id' artificial, ni atributos inventados como 'quantity', 'cantidad', 'fechaRegistro', etc.
    const getEntityFk = (
      node: UmlClassNode,
      existingAttrs: { name: string; type: string }[] = [],
    ): { name: string; type: string } => {
      const nodeStems = getStems(node.name);

      const existingFk = existingAttrs.find((a) => {
        const aClean = cleanStr(a.name);
        if (aClean === 'id') return false;
        return nodeStems.some((stem) => matchesStem(aClean, stem));
      });

      if (existingFk) {
        return { name: existingFk.name, type: existingFk.type || 'UUID' };
      }

      const pkAttr =
        (node.attributes || []).find((a) =>
          /^(id|.*_id|.*id)$/i.test(a.name.trim()),
        ) || (node.attributes || [])[0];

      const pkType = pkAttr?.type || 'UUID';

      let base = node.name.trim();
      if (base.toLowerCase().endsWith('es') && base.length > 3) {
        base = base.slice(0, -2);
      } else if (
        base.toLowerCase().endsWith('s') &&
        base.length > 2 &&
        !base.toLowerCase().endsWith('ss')
      ) {
        base = base.slice(0, -1);
      }
      const camelBase = base.charAt(0).toLowerCase() + base.slice(1);
      return { name: `${camelBase}Id`, type: pkType };
    };

    const sourceFk = getEntityFk(sourceNode, assocNode.attributes);
    const targetFk = getEntityFk(targetNode, assocNode.attributes);

    if (sourceFk.name.toLowerCase() === targetFk.name.toLowerCase()) {
      sourceFk.name = `${cleanStr(sourceNode.name)}Id`;
      targetFk.name = `${cleanStr(targetNode.name)}Id`;
    }

    assocNode.attributes = [sourceFk, targetFk];
    assocNode.methods = [];
    nodeMap.set(assocNode.id, assocNode);

    // Asegurar nodo ancla virtual
    let anchorNode: UmlClassNode | undefined;
    if (conn.assocAnchorNodeId && nodeMap.has(conn.assocAnchorNodeId)) {
      anchorNode = nodeMap.get(conn.assocAnchorNodeId);
    }

    if (!anchorNode) {
      // Buscar si hay un ancla ya conectada con assocNode mediante association_class
      for (const c of connMap.values()) {
        if (c.type === 'association_class') {
          const maybeAnchorId =
            c.sourceNodeId === assocNode.id ||
            c.sourceId?.startsWith(assocNode.id)
              ? c.targetNodeId
              : c.sourceNodeId;
          if (
            maybeAnchorId &&
            nodeMap.has(maybeAnchorId) &&
            nodeMap.get(maybeAnchorId)?.isAnchor
          ) {
            anchorNode = nodeMap.get(maybeAnchorId);
            break;
          }
        }
      }
    }

    if (!anchorNode) {
      const timestamp =
        Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
      const anchorId = `anchor_${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
      const anchorPosX = Math.round(
        (sourceNode.position.x + targetNode.position.x) / 2,
      );
      const anchorPosY = Math.round(
        (sourceNode.position.y + targetNode.position.y) / 2,
      );

      anchorNode = {
        id: anchorId,
        name: '',
        position: { x: anchorPosX, y: anchorPosY },
        width: 0,
        height: 0,
        isAnchor: true,
        attributes: [],
        methods: [],
      };
      nodeMap.set(anchorId, anchorNode);
    }

    // Actualizar la conexión principal con el ancla y multiplicidades
    const updatedMainConn: UmlConnection = {
      ...conn,
      sourceNodeId: sId,
      targetNodeId: tId,
      assocAnchorNodeId: anchorNode.id,
      name:
        conn.name && conn.name !== 'relacion' && !conn.name.startsWith('conn_')
          ? conn.name
          : assocNode.name,
      sourceMultiplicity: '*',
      targetMultiplicity: '*',
    };
    connMap.set(conn.id, updatedMainConn);

    // Asegurar conexión discontinua («link») entre el ancla y la tabla asociativa
    let linkConn = Array.from(connMap.values()).find(
      (c) =>
        c.type === 'association_class' &&
        ((c.sourceNodeId === anchorNode!.id &&
          (c.targetNodeId === assocNode.id ||
            c.targetId?.startsWith(assocNode.id))) ||
          (c.targetNodeId === anchorNode!.id &&
            (c.sourceNodeId === assocNode.id ||
              c.sourceId?.startsWith(assocNode.id)))),
    );

    if (linkConn) {
      linkConn.sourceNodeId = anchorNode.id;
      linkConn.targetNodeId = assocNode.id;
      linkConn.sourceId = anchorNode.id;
      linkConn.targetId = `${assocNode.id}_top`;
      linkConn.type = 'association_class';
      linkConn.name = '«link»';
      connMap.set(linkConn.id, linkConn);
    } else {
      const timestamp =
        Date.now() + resolvedCount + Math.floor(Math.random() * 1000);
      const dashedConnId = `conn_${timestamp}_assoc_dashed`;
      linkConn = {
        id: dashedConnId,
        sourceNodeId: anchorNode.id,
        targetNodeId: assocNode.id,
        sourceId: anchorNode.id,
        targetId: `${assocNode.id}_top`,
        type: 'association_class',
        name: '«link»',
      };
      connMap.set(dashedConnId, linkConn);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    connections: Array.from(connMap.values()),
    resolvedCount,
  };
}
