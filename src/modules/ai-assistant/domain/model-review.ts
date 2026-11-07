import { UmlClassNode, UmlConnection } from './uml-diagram.types';

const SIDE_SUFFIX = /(?:_(?:top|bottom|left|right)|__box)$/;
const KEY_WORDS = ['id', 'cod', 'codigo', 'code', 'fk', 'nro', 'numero'];

const endpoint = (nodeId: string | undefined, connectorId: string) =>
  nodeId || connectorId.replace(SIDE_SUFFIX, '');

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');

/** «clienteId», «idCliente», «codigoCliente», «cliente_fk»: un atributo que apunta a la clase. */
function pointsTo(attribute: string, className: string): boolean {
  const name = plain(attribute);
  const target = plain(className);
  if (!target || !name.includes(target)) return false;
  const rest = name.replace(target, '');
  return KEY_WORDS.includes(rest);
}

/**
 * Comprobaciones deterministas del diagrama que el modelo pequeño suele pasar por alto. Trazo
 * las recibe como observaciones verificadas cuando le piden una revisión.
 */
export function reviewFindings(
  nodes: UmlClassNode[],
  connections: UmlConnection[],
): string[] {
  const classes = new Map(
    nodes.filter((n) => !n.isAnchor && n.name).map((n) => [n.id, n]),
  );
  const findings: string[] = [];

  for (const c of connections) {
    if (c.type === 'generalization' || c.type === 'realization') continue;
    const source = classes.get(endpoint(c.sourceNodeId, c.sourceId));
    const target = classes.get(endpoint(c.targetNodeId, c.targetId));
    if (!source || !target) continue;
    for (const [owner, other] of [
      [source, target],
      [target, source],
    ]) {
      for (const a of owner.attributes || []) {
        if (pointsTo(a.name, other.name)) {
          findings.push(
            `${owner.name}.${a.name} repite la relación con ${other.name}: sobra, JPA ya crea la clave foránea (propón quitarlo con update_class y removeAttributes).`,
          );
        }
      }
    }
  }

  for (const n of classes.values()) {
    if (!(n.attributes || []).some((a) => plain(a.name) === 'id')) {
      findings.push(`${n.name} no tiene atributo id.`);
    }
    for (const a of n.attributes || []) {
      if (
        /^(double|float)$/i.test(a.type) &&
        /(precio|monto|total|importe|saldo|costo|pago|subtotal)/i.test(a.name)
      ) {
        findings.push(
          `${n.name}.${a.name} es dinero en ${a.type}: mejor BigDecimal.`,
        );
      }
    }
  }
  return [...new Set(findings)];
}
