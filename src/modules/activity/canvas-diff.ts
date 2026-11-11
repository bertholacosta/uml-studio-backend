/**
 * Qué cambió entre dos estados de un diagrama, en hechos legibles («creó Pago», «+email en
 * Cliente», «relación Pedido * — 1 Cliente»). Las posiciones no cuentan: mover una clase no es
 * un cambio del modelo.
 */

/** Forma mínima de una clase: sirve tanto la del socket (position) como la del AST guardado. */
export interface DiffNode {
  id: string;
  name?: string | null;
  isAnchor?: boolean | null;
  attributes?:
    { name: string; type?: string | null; visibility?: string | null }[] | null;
  methods?:
    | {
        name: string;
        parameters?: string | null;
        returnType?: string | null;
        visibility?: string | null;
      }[]
    | null;
}

export interface DiffConnection {
  id: string;
  sourceNodeId?: string | null;
  targetNodeId?: string | null;
  sourceId?: string | null;
  targetId?: string | null;
  type?: string | null;
  name?: string | null;
  sourceMultiplicity?: string | null;
  targetMultiplicity?: string | null;
  sourceRole?: string | null;
  targetRole?: string | null;
  navigability?: string | null;
}

export type FactKind = 'class' | 'attribute' | 'method' | 'relation';
export type ChangeKind = 'added' | 'removed' | 'changed';

/** Un elemento del diagrama: su clave estable y su valor visible. */
interface Fact {
  what: FactKind;
  /** Clase del atributo o método (su id, estable aunque se renombre). */
  nodeId?: string;
  className?: string;
  name: string;
  /** Lo que se compara (en las relaciones, sus extremos por id: renombrar una clase no las cambia). */
  value: string;
  /** Lo que se muestra. */
  display: string;
}

/** Un cambio: qué elemento, de qué tipo y cómo era antes y después. */
export interface CanvasChange {
  key: string;
  what: FactKind;
  kind: ChangeKind;
  nodeId?: string;
  className?: string;
  name: string;
  before?: string;
  after?: string;
  /** Valores comparables de antes y después (no se muestran). */
  from?: string;
  to?: string;
  /** Cuándo se hizo por última vez (ms): permite contar solo lo posterior a una fecha. */
  at?: number;
}

export type FactMap = Map<string, Fact>;

const SIDE_SUFFIX = /(?:_(?:top|bottom|left|right)|__box)$/;

const RELATION_NAMES: Record<string, string> = {
  association: 'asociación',
  generalization: 'herencia',
  realization: 'realización',
  composition: 'composición',
  aggregation: 'agregación',
  dependency: 'dependencia',
};

const VISIBILITY_NAMES: Record<string, string> = {
  public: 'público',
  private: 'privado',
  protected: 'protegido',
  package: 'de paquete',
};

function endpoint(
  nodeId: string | null | undefined,
  connectorId: string | null | undefined,
): string {
  return nodeId || (connectorId || '').replace(SIDE_SUFFIX, '');
}

/** Navegabilidad indicada; «sin indicar» es lo mismo que no tener el dato. */
function navigabilityOf(c: DiffConnection): string {
  return c.navigability && c.navigability !== 'unspecified'
    ? c.navigability
    : '';
}

/**
 * Visibilidad que se añade al valor comparado solo si no es la habitual (atributo privado,
 * método público): así un diagrama sin ese dato vale lo mismo que antes.
 */
function visibilityMark(
  visibility: string | null | undefined,
  usual: string,
): { value: string; display: string } {
  if (!visibility || visibility === usual) return { value: '', display: '' };
  return {
    value: `|${visibility}`,
    display: ` (${VISIBILITY_NAMES[visibility] || visibility})`,
  };
}

function relationLabel(
  c: DiffConnection,
  source: string,
  target: string,
): string {
  const type = RELATION_NAMES[c.type || ''] || c.type || 'relación';
  const end = (mult?: string | null, role?: string | null) =>
    [mult, role].filter(Boolean).join(' ');
  const sourceEnd = end(c.sourceMultiplicity, c.sourceRole);
  const targetEnd = end(c.targetMultiplicity, c.targetRole);
  const left = sourceEnd ? `${sourceEnd} ` : '';
  const right = targetEnd ? ` ${targetEnd}` : '';
  const name = c.name ? ` «${c.name}»` : '';
  const nav = navigabilityOf(c);
  const from = nav === 'to_source' || nav === 'both' ? '←' : '—';
  const to = nav === 'to_target' || nav === 'both' ? '→' : '—';
  return `${source} ${left}${from}${type}${to}${right} ${target}${name}`;
}

/** Los elementos de un diagrama con una clave estable cada uno. */
export function factsOf(
  nodes: DiffNode[] = [],
  connections: DiffConnection[] = [],
): FactMap {
  const facts: FactMap = new Map();
  const names = new Map<string, string>();
  const anchors = new Set<string>();

  for (const n of nodes) {
    if (!n?.id) continue;
    if (n.isAnchor) {
      anchors.add(n.id);
      continue;
    }
    const className = (n.name || '').trim() || '(sin nombre)';
    names.set(n.id, className);
    facts.set(`class:${n.id}`, {
      what: 'class',
      name: className,
      value: className,
      display: className,
    });
    for (const a of n.attributes || []) {
      if (!a?.name?.trim()) continue;
      const mark = visibilityMark(a.visibility, 'private');
      facts.set(`attribute:${n.id}:${a.name.trim()}`, {
        what: 'attribute',
        nodeId: n.id,
        className,
        name: a.name.trim(),
        value: (a.type || '') + mark.value,
        display: (a.type || '') + mark.display,
      });
    }
    for (const m of n.methods || []) {
      if (!m?.name?.trim()) continue;
      const signature = `${m.name.trim()}(${m.parameters || ''})`;
      const mark = visibilityMark(m.visibility, 'public');
      facts.set(`method:${n.id}:${signature}`, {
        what: 'method',
        nodeId: n.id,
        className,
        name: signature,
        value: (m.returnType || 'void') + mark.value,
        display: (m.returnType || 'void') + mark.display,
      });
    }
  }

  for (const c of connections) {
    if (!c?.id) continue;
    const source = endpoint(c.sourceNodeId, c.sourceId);
    const target = endpoint(c.targetNodeId, c.targetId);
    // Las uniones con el ancla de una clase de asociación no aportan al resumen
    if (anchors.has(source) || anchors.has(target)) continue;
    const label = relationLabel(
      c,
      names.get(source) || '?',
      names.get(target) || '?',
    );
    facts.set(`relation:${c.id}`, {
      what: 'relation',
      name: label,
      value: [
        source,
        target,
        c.type,
        c.sourceMultiplicity,
        c.targetMultiplicity,
        c.name,
        // Solo si se indicaron: una relación sin estos datos vale lo mismo que antes
        ...(c.sourceRole || c.targetRole || navigabilityOf(c)
          ? [c.sourceRole, c.targetRole, navigabilityOf(c)]
          : []),
      ].join('|'),
      display: label,
    });
  }
  return facts;
}

/** Cambios para pasar de un estado al otro. */
export function diffFacts(before: FactMap, after: FactMap): CanvasChange[] {
  const changes: CanvasChange[] = [];
  for (const [key, fact] of after) {
    const old = before.get(key);
    if (!old) {
      changes.push({
        key,
        ...meta(fact),
        kind: 'added',
        after: fact.display,
        to: fact.value,
      });
    } else if (old.value !== fact.value) {
      changes.push({
        key,
        ...meta(fact),
        kind: 'changed',
        before: old.display,
        after: fact.display,
        from: old.value,
        to: fact.value,
      });
    }
  }
  for (const [key, fact] of before) {
    if (!after.has(key)) {
      changes.push({
        key,
        ...meta(fact),
        kind: 'removed',
        before: fact.display,
        from: fact.value,
      });
    }
  }
  return changes;
}

function meta(fact: Fact): Omit<CanvasChange, 'key' | 'kind'> {
  return {
    what: fact.what,
    name: fact.name,
    ...(fact.nodeId && { nodeId: fact.nodeId }),
    ...(fact.className && { className: fact.className }),
  };
}

/**
 * Suma un cambio nuevo a los acumulados de la misma persona: crear y después borrar algo se
 * anula; cambiarlo dos veces queda como un solo cambio del valor original al último.
 */
export function mergeChanges(
  existing: CanvasChange[],
  delta: CanvasChange[],
): CanvasChange[] {
  const byKey = new Map(existing.map((c) => [c.key, { ...c }]));
  for (const next of delta) {
    const prev = byKey.get(next.key);
    if (!prev) {
      byKey.set(next.key, { ...next });
      continue;
    }
    const merged = compose(prev, next);
    if (merged) byKey.set(next.key, merged);
    else byKey.delete(next.key);
  }
  return Array.from(byKey.values());
}

function compose(prev: CanvasChange, next: CanvasChange): CanvasChange | null {
  const original = { before: prev.before, from: prev.from };
  if (prev.kind === 'added') {
    // Se creó y se borró: no queda nada; se creó y se cambió: sigue siendo nuevo
    return next.kind === 'removed'
      ? null
      : { ...next, kind: 'added', before: undefined, from: undefined };
  }
  if (prev.kind === 'removed') {
    if (next.kind !== 'added') return { ...prev };
    // Se borró y se volvió a crear igual: no hubo cambio
    return prev.from === next.to
      ? null
      : { ...next, ...original, kind: 'changed' };
  }
  // Ya estaba cambiado
  if (next.kind === 'removed') {
    return {
      ...next,
      ...original,
      kind: 'removed',
      after: undefined,
      to: undefined,
    };
  }
  return prev.from === next.to
    ? null
    : { ...next, ...original, kind: 'changed' };
}

/** Solo los cambios posteriores a una fecha (los que no tienen hora toman la de respaldo). */
export function changesSince(
  changes: CanvasChange[],
  since: Date,
  fallbackAt = Number.POSITIVE_INFINITY,
): CanvasChange[] {
  return changes.filter((c) => (c.at ?? fallbackAt) > since.getTime());
}

/** Resumen en una línea: «creó Pago (id: UUID, monto: BigDecimal); en Cliente: +email: String». */
export function describeChanges(changes: CanvasChange[]): string {
  const addedClasses = new Map<string, CanvasChange>();
  const removedClasses = new Set<string>();
  for (const c of changes) {
    if (c.what !== 'class') continue;
    const nodeId = c.key.slice('class:'.length);
    if (c.kind === 'added') addedClasses.set(nodeId, c);
    if (c.kind === 'removed') removedClasses.add(nodeId);
  }

  const parts: string[] = [];
  for (const [nodeId, c] of addedClasses) {
    const members = changes
      .filter(
        (m) =>
          m.nodeId === nodeId &&
          m.kind === 'added' &&
          (m.what === 'attribute' || m.what === 'method'),
      )
      .map((m) => member(m, m.after));
    parts.push(
      `creó la clase ${c.after}${members.length ? ` (${members.join(', ')})` : ''}`,
    );
  }
  for (const c of changes) {
    if (c.what !== 'class') continue;
    if (c.kind === 'removed') parts.push(`eliminó la clase ${c.before}`);
    if (c.kind === 'changed') parts.push(`renombró ${c.before} → ${c.after}`);
  }

  // Atributos y métodos de clases que ya existían, agrupados por clase
  const byClass = new Map<string, string[]>();
  for (const c of changes) {
    if (c.what !== 'attribute' && c.what !== 'method') continue;
    if (addedClasses.has(c.nodeId!) || removedClasses.has(c.nodeId!)) continue;
    const text =
      c.kind === 'added'
        ? `+${member(c, c.after)}`
        : c.kind === 'removed'
          ? `−${c.name}`
          : `${c.name}: ${c.before || '?'} → ${c.after || '?'}`;
    const list = byClass.get(c.className!) || [];
    list.push(text);
    byClass.set(c.className!, list);
  }
  for (const [className, list] of byClass) {
    parts.push(`en ${className}: ${list.join(', ')}`);
  }

  for (const c of changes) {
    if (c.what !== 'relation') continue;
    if (c.kind === 'added') parts.push(`relacionó ${c.after}`);
    if (c.kind === 'removed') parts.push(`quitó la relación ${c.before}`);
    if (c.kind === 'changed')
      parts.push(`cambió la relación ${c.before} → ${c.after}`);
  }
  return parts.join('; ');
}

function member(c: CanvasChange, value?: string): string {
  if (c.what === 'method') return `${c.name}: ${value || 'void'}`;
  return value ? `${c.name}: ${value}` : c.name;
}
