import { Logger } from '@nestjs/common';
import { UmlClassNode, UmlConnection } from './uml-diagram.types';
import { findNodeFuzzy, normalizeForFuzzy } from './node-matching';

const logger = new Logger('DiagramMerger');

/**
 * Fusiona el diagrama que devuelve la IA con el actual: conserva posiciones e ids de lo existente,
 * descarta tablas o relaciones que el usuario no pidió y elimina en cascada tablas intermedias huérfanas.
 */
export function mergeNodesAndConnections(
  currentNodes: UmlClassNode[],
  currentConnections: UmlConnection[],
  aiNodes: UmlClassNode[],
  aiConnections: UmlConnection[],
  prompt: string,
): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
  const isFullGeneration =
    prompt.includes('1. Tablas y Atributos') && currentNodes.length === 0;
  const isAttributeOrMethodPrompt =
    /(?:atributos?|m[eé]todos?|campos?|propiedad(?:es)?)\b/i.test(prompt);
  const isDeletePrompt =
    !isAttributeOrMethodPrompt &&
    /(?:elimina|eliminar|borra|borrar|quita|quitar|delete|remove|destruye|destruir|suprime|suprimir)\b/i.test(
      prompt,
    );

  const asksForRelations =
    /(?:relaci[oó]n|conecta|asocia|cardinalidad|multiplicidad|muchos|uno\s+a|pertenece|tiene|vincula|\*|--)/i.test(
      prompt,
    );

  // Detectar si el usuario solicitó específicamente agregar una tabla concreta sin relaciones
  const singleTableAddMatch = prompt.match(
    /(?:crea(?:r)?|agrega(?:r)?|a[ñn]ade(?:r)?|inserta(?:r)?)\s+(?:una\s+|la\s+)?(?:nueva\s+)?(?:tabla|clase|entidad)\s*(?:(?:llamada|denominada|de|para)\s+)?([a-zA-Z0-9_]+)/i,
  );
  const requestedTableName = singleTableAddMatch
    ? normalizeForFuzzy(singleTableAddMatch[1])
    : null;

  const mergedNodesMap = new Map<string, UmlClassNode>();

  if (isFullGeneration && aiNodes.length > 0) {
    // Reemplazo completo de esquema inicial
    for (const node of aiNodes) {
      const id =
        node.id ||
        `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      mergedNodesMap.set(id, { ...node, id });
    }
  } else if (isDeletePrompt && aiNodes.length === 0) {
    // Si fue eliminación y el resultado quedó vacío
    return { nodes: [], connections: [] };
  } else if (isDeletePrompt && aiNodes.length > 0) {
    // Si el prompt fue de eliminación de tablas y Vertex AI devolvió las tablas restantes:
    // Conservamos las posiciones y datos de las tablas existentes que Vertex AI mantuvo
    for (const aiNode of aiNodes) {
      if (!aiNode || !aiNode.name) continue;
      const existingNode = findNodeFuzzy(currentNodes, aiNode.name);

      if (existingNode) {
        mergedNodesMap.set(existingNode.id, {
          ...existingNode,
          name: aiNode.name || existingNode.name,
          attributes: Array.isArray(aiNode.attributes)
            ? aiNode.attributes
            : existingNode.attributes,
          methods: Array.isArray(aiNode.methods)
            ? aiNode.methods
            : existingNode.methods,
        });
      } else {
        const newId =
          aiNode.id ||
          `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        mergedNodesMap.set(newId, {
          ...aiNode,
          id: newId,
          position: aiNode.position || { x: 120, y: 80 },
          width: aiNode.width || 220,
          attributes: aiNode.attributes || [],
          methods: aiNode.methods || [],
        });
      }
    }
  } else {
    // Fusión normal (adición / modificación / eliminación de atributos): preservar todos los nodos actuales
    for (const node of currentNodes) {
      mergedNodesMap.set(node.id, { ...node });
    }

    let maxPosX = currentNodes.reduce(
      (max, n) => Math.max(max, n.position.x + (n.width || 220)),
      50,
    );
    let maxPosY = 80;

    for (const aiNode of aiNodes) {
      if (!aiNode || !aiNode.name) continue;
      const existingNode = findNodeFuzzy(
        Array.from(mergedNodesMap.values()),
        aiNode.name,
      );

      if (existingNode) {
        mergedNodesMap.set(existingNode.id, {
          ...existingNode,
          name: aiNode.name || existingNode.name,
          attributes: Array.isArray(aiNode.attributes)
            ? aiNode.attributes
            : existingNode.attributes,
          methods: Array.isArray(aiNode.methods)
            ? aiNode.methods
            : existingNode.methods,
        });
      } else {
        // Si el usuario solo pidió agregar UNA tabla específica y NO pidió relaciones:
        if (requestedTableName && !asksForRelations) {
          // Contar cuántos nodos nuevos ha generado el LLM en total que no existían
          const newAiNodes = aiNodes.filter(
            (n) =>
              !currentNodes.some(
                (cn) =>
                  cn.id === n.id ||
                  normalizeForFuzzy(cn.name) === normalizeForFuzzy(n.name),
              ),
          );
          // Si el LLM generó una sola tabla nueva, ¡es la tabla solicitada por el usuario!
          // Solo filtramos si generó múltiples tablas para evitar stubs/tablas intermedias alucinadas (ej: Usuario_Products)
          if (newAiNodes.length > 1) {
            const aiNodeNorm = normalizeForFuzzy(aiNode.name);
            const requestedNorm = requestedTableName;
            const isExactMatch = aiNodeNorm === requestedNorm;
            const isCompound =
              aiNode.name.includes('_') ||
              aiNodeNorm.length >= (requestedNorm?.length || 0) + 4;
            const matchesRequested =
              isExactMatch ||
              (!isCompound &&
                !!findNodeFuzzy([aiNode], singleTableAddMatch![1]));
            if (!matchesRequested) {
              logger.warn(
                `[AiAssistant] Descartando tabla no solicitada / alucinada por LLM: ${aiNode.name}`,
              );
              continue;
            }
          }
        }

        const newId =
          aiNode.id && !aiNode.id.startsWith('node_xxx')
            ? aiNode.id
            : `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        let posX = aiNode.position?.x;
        let posY = aiNode.position?.y;

        if (posX === undefined || posX < 50) {
          posX = maxPosX + 60;
          posY = maxPosY;
          maxPosX = posX + 240;
        }

        const newNode: UmlClassNode = {
          id: newId,
          name: aiNode.name,
          position: { x: posX, y: posY },
          width: aiNode.width || 220,
          attributes: aiNode.attributes || [],
          methods: aiNode.methods || [],
        };

        mergedNodesMap.set(newId, newNode);
      }
    }
  }

  // Salvaguarda determinista: Si el usuario solicitó explícitamente eliminar todos los atributos de una tabla específica
  const deleteAllAttrsMatch = prompt.match(
    /(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|vac[ií]a(?:r)?)\s+(?:todos\s+los\s+|los\s+)?atributos\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?([A-Za-z0-9_<>«»]+)/i,
  );
  if (deleteAllAttrsMatch && deleteAllAttrsMatch[1]) {
    const rawTarget = deleteAllAttrsMatch[1].replace(/[<>«»]/g, '').trim();
    const targetNode = findNodeFuzzy(
      Array.from(mergedNodesMap.values()),
      rawTarget,
    );
    if (targetNode) {
      const existing = mergedNodesMap.get(targetNode.id);
      if (existing) {
        mergedNodesMap.set(targetNode.id, {
          ...existing,
          attributes: [],
        });
      }
    }
  }

  // Salvaguarda determinista: Si el usuario solicitó explícitamente eliminar todos los métodos de una tabla específica
  const deleteAllMethodsMatch = prompt.match(
    /(?:elimina(?:r)?|borra(?:r)?|quita(?:r)?|vac[ií]a(?:r)?)\s+(?:todos\s+los\s+|los\s+)?m[eé]todos\s+(?:de\s+(?:la\s+)?(?:tabla|clase|entidad)\s*|de\s+)?([A-Za-z0-9_<>«»]+)/i,
  );
  if (deleteAllMethodsMatch && deleteAllMethodsMatch[1]) {
    const rawTarget = deleteAllMethodsMatch[1].replace(/[<>«»]/g, '').trim();
    const targetNode = findNodeFuzzy(
      Array.from(mergedNodesMap.values()),
      rawTarget,
    );
    if (targetNode) {
      const existing = mergedNodesMap.get(targetNode.id);
      if (existing) {
        mergedNodesMap.set(targetNode.id, {
          ...existing,
          methods: [],
        });
      }
    }
  }

  // Limpieza en cascada para clases de asociación / tablas intermedias:
  // Si una tabla participante en una relación muchos a muchos fue eliminada de mergedNodesMap,
  // se debe eliminar en cascada la tabla asociativa intermedia (AB), su nodo ancla y sus conexiones.
  const remainingNodeIds = new Set(mergedNodesMap.keys());
  const nodesToRemoveInCascade = new Set<string>();

  for (const conn of currentConnections) {
    const sId =
      conn.sourceNodeId ||
      conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
    const tId =
      conn.targetNodeId ||
      conn.targetId.replace(/_(top|bottom|left|right)$/, '');

    const sourceMissing = !remainingNodeIds.has(sId);
    const targetMissing = !remainingNodeIds.has(tId);

    if (sourceMissing || targetMissing) {
      if (conn.assocAnchorNodeId) {
        nodesToRemoveInCascade.add(conn.assocAnchorNodeId);
      }
      for (const [nodeId, node] of mergedNodesMap.entries()) {
        if (node.assocMainConnId === conn.id) {
          nodesToRemoveInCascade.add(nodeId);
        }
      }
    }
  }

  // Limpiar nodos ancla huérfanos
  for (const [nodeId, node] of mergedNodesMap.entries()) {
    if (node.isAnchor) {
      const hasActiveConn = currentConnections.some((c) => {
        const sId =
          c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
        const tId =
          c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
        return (
          (c.assocAnchorNodeId === nodeId ||
            sId === nodeId ||
            tId === nodeId) &&
          remainingNodeIds.has(sId) &&
          remainingNodeIds.has(tId)
        );
      });
      if (!hasActiveConn) {
        nodesToRemoveInCascade.add(nodeId);
      }
    }
  }

  for (const idToRemove of nodesToRemoveInCascade) {
    mergedNodesMap.delete(idToRemove);
  }

  const mergedNodes = Array.from(mergedNodesMap.values());

  // Fusión de conexiones
  const mergedConnsMap = new Map<string, UmlConnection>();
  const mergedNodeIds = new Set(mergedNodes.map((n) => n.id));

  if (!isFullGeneration) {
    for (const conn of currentConnections) {
      const sId =
        conn.sourceNodeId ||
        conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
      const tId =
        conn.targetNodeId ||
        conn.targetId.replace(/_(top|bottom|left|right)$/, '');
      if (mergedNodeIds.has(sId) && mergedNodeIds.has(tId)) {
        mergedConnsMap.set(conn.id, {
          ...conn,
          sourceNodeId: sId,
          targetNodeId: tId,
        });
      }
    }
  }

  const resolveNode = (idOrName?: string): UmlClassNode | undefined => {
    if (!idOrName) return undefined;
    const clean = idOrName.replace(/_(top|bottom|left|right)$/, '').trim();
    return (
      mergedNodes.find((n) => n.id === clean) ||
      findNodeFuzzy(mergedNodes, clean)
    );
  };

  for (const aiConn of aiConnections) {
    const sourceNode = resolveNode(aiConn.sourceNodeId || aiConn.sourceId);
    const targetNode = resolveNode(aiConn.targetNodeId || aiConn.targetId);

    if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
      // Salvaguarda: Si el usuario NO solicitó relaciones y solo pidió agregar una tabla,
      // no aceptar conexiones nuevas que vinculen tablas recién agregadas con las existentes
      if (requestedTableName && !asksForRelations) {
        const isSourceExisting = currentNodes.some(
          (n) => n.id === sourceNode.id,
        );
        const isTargetExisting = currentNodes.some(
          (n) => n.id === targetNode.id,
        );
        if (!isSourceExisting || !isTargetExisting) {
          logger.warn(
            `[AiAssistant] Descartando conexión no solicitada / alucinada entre ${sourceNode.name} y ${targetNode.name}`,
          );
          continue;
        }
      }

      const connId =
        aiConn.id && !aiConn.id.startsWith('conn_xxx')
          ? aiConn.id
          : `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      mergedConnsMap.set(connId, {
        id: connId,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        sourceId: `${sourceNode.id}_right`,
        targetId: `${targetNode.id}_left`,
        type: aiConn.type || 'association',
        name: aiConn.name,
        sourceMultiplicity: aiConn.sourceMultiplicity || '',
        targetMultiplicity: aiConn.targetMultiplicity || '',
      });
    }
  }

  return {
    nodes: mergedNodes,
    connections: Array.from(mergedConnsMap.values()),
  };
}
