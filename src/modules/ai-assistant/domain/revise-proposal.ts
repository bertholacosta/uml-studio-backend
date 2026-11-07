import { DiagramOperation } from './diagram-operations';

type Op = DiagramOperation & Record<string, any>;
type Member = { name: string; [key: string]: unknown };

const key = (name: unknown) =>
  String(name ?? '')
    .trim()
    .toLowerCase();
const sameEnds = (a: Op, b: Op) =>
  (key(a.source) === key(b.source) && key(a.target) === key(b.target)) ||
  (key(a.source) === key(b.target) && key(a.target) === key(b.source));

/** Aplica a la lista de atributos o métodos de una clase propuesta lo que pide un update_class. */
function reviseMembers(
  list: Member[] = [],
  change: {
    clear?: boolean;
    add?: Member[];
    remove?: string[];
    update?: { name: string; newName?: string; type?: string }[];
  },
): Member[] {
  let result = change.clear ? [] : list.map((m) => ({ ...m }));
  const removed = new Set((change.remove || []).map(key));
  result = result.filter((m) => !removed.has(key(m.name)));
  for (const u of change.update || []) {
    const target = result.find((m) => key(m.name) === key(u.name));
    if (!target) continue;
    if (u.newName) target.name = u.newName;
    if (u.type) target.type = u.type;
  }
  for (const m of change.add || []) {
    const existing = result.findIndex((r) => key(r.name) === key(m.name));
    if (existing >= 0) result[existing] = { ...m };
    else result.push({ ...m });
  }
  return result;
}

/**
 * Propuesta corregida al responderle a Trazo («pon monto como Double»). El modelo debería
 * devolver la lista completa, pero a menudo devuelve solo el cambio (update_class Pago, cuando
 * Pago todavía no existe). Si la nueva lista ya incluye todas las clases que creaba la
 * propuesta original, se usa tal cual; si no, se integra el cambio en las operaciones originales.
 */
export function reviseProposal(
  original: Record<string, unknown>[],
  changes: DiagramOperation[],
): DiagramOperation[] {
  const base = original as Op[];
  const delta = changes as Op[];
  const created = base
    .filter((o) => o.op === 'add_class')
    .map((o) => key(o.name));
  const recreated = new Set(
    delta.filter((o) => o.op === 'add_class').map((o) => key(o.name)),
  );
  if (created.length && created.every((name) => recreated.has(name))) {
    return changes;
  }

  let result: Op[] = base.map((o) => JSON.parse(JSON.stringify(o)));
  for (const op of delta) {
    const addIndex = (name: unknown) =>
      result.findIndex(
        (o) => o.op === 'add_class' && key(o.name) === key(name),
      );

    if (op.op === 'add_class' && addIndex(op.name) >= 0) {
      result[addIndex(op.name)] = { ...op };
    } else if (op.op === 'update_class' && addIndex(op.target) >= 0) {
      const added = result[addIndex(op.target)];
      if (op.rename) {
        // Las relaciones de la propuesta siguen a la clase renombrada
        for (const o of result) {
          if (key(o.source) === key(added.name)) o.source = op.rename;
          if (key(o.target) === key(added.name)) o.target = op.rename;
        }
        added.name = op.rename;
      }
      added.attributes = reviseMembers(added.attributes, {
        clear: op.clearAttributes,
        add: op.addAttributes,
        remove: op.removeAttributes,
        update: op.updateAttributes,
      });
      added.methods = reviseMembers(added.methods, {
        clear: op.clearMethods,
        add: op.addMethods,
        remove: op.removeMethods,
      });
    } else if (op.op === 'remove_class' && addIndex(op.target) >= 0) {
      const name = key(op.target);
      result = result.filter(
        (o) =>
          !(o.op === 'add_class' && key(o.name) === name) &&
          key(o.source) !== name &&
          key(o.target) !== name,
      );
    } else if (
      op.op === 'update_relation' &&
      result.some((o) => o.op === 'add_relation' && sameEnds(o, op))
    ) {
      const relation = result.find(
        (o) => o.op === 'add_relation' && sameEnds(o, op),
      )!;
      for (const field of [
        'type',
        'name',
        'sourceMultiplicity',
        'targetMultiplicity',
      ]) {
        if (op[field] !== undefined) relation[field] = op[field];
      }
    } else if (
      op.op === 'remove_relation' &&
      result.some((o) => o.op === 'add_relation' && sameEnds(o, op))
    ) {
      result = result.filter(
        (o) => !(o.op === 'add_relation' && sameEnds(o, op)),
      );
    } else {
      result.push({ ...op });
    }
  }
  return result as DiagramOperation[];
}
