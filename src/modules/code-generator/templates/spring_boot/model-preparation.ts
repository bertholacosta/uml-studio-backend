import {
  JavaClassMeta,
  JoinTableMeta,
  idReferenceSqlType,
  toPascalCase,
  toSingular,
  toSnakeCase,
} from './template-models';

/** Relaciones UML que no se traducen en columnas ni asociaciones JPA. */
export const NON_STRUCTURAL_RELATIONS = new Set([
  'generalization',
  'realization',
  'dependency',
  'association_class',
]);

export interface JoinTableSpec {
  tableName: string;
  sourceColumn: string;
  targetColumn: string;
}

export interface PreparedModel {
  /** Nodos que se convierten en entidades (sin anclas ni tablas de unión puras). */
  classNodes: any[];
  /** Relaciones a mapear; una clase de asociación con atributos propios sustituye a su M:N. */
  connections: any[];
  /** Pares [id del hijo, id del padre]: en el diagrama la flecha va de la subclase a la superclase. */
  generalizations: [string, string][];
  /** Tabla intermedia del diagrama para cada relación M:N, por id de conexión. */
  joinTables: Map<string, JoinTableSpec>;
}

const nodeIdOf = (nodeId?: string, handleId?: string) =>
  nodeId || (handleId || '').replace(/_(top|bottom|left|right)$/, '');
const isManyMultiplicity = (m?: string) => /[*nm]/i.test(m || '');
const classSnake = (name: string) => toSnakeCase(toPascalCase(name));

/**
 * Interpreta el diagrama antes de generar:
 * - Una tabla intermedia que solo tiene las dos claves foráneas es la tabla de unión del
 *   @ManyToMany (no es una entidad).
 * - Una clase de asociación con atributos propios (p. ej. cantidad) se modela como entidad con
 *   dos @ManyToOne, sustituyendo a la relación M:N directa.
 */
export function prepareModel(nodes: any[], connections: any[]): PreparedModel {
  const valid = nodes.filter(
    (n) => !n.isAnchor && n.name && n.name.trim().length > 0,
  );
  const byId = new Map(valid.map((n) => [n.id, n]));
  const excluded = new Set<string>();
  const replaced = new Set<string>();
  const virtual: any[] = [];
  const joinTables = new Map<string, JoinTableSpec>();

  const generalizations = connections
    .filter((c) => c.type === 'generalization')
    .map(
      (c) =>
        [
          nodeIdOf(c.sourceNodeId, c.sourceId),
          nodeIdOf(c.targetNodeId, c.targetId),
        ] as [string, string],
    );

  for (const assoc of valid.filter((n) => n.assocMainConnId)) {
    const main = connections.find((c) => c.id === assoc.assocMainConnId);
    if (
      !main ||
      !isManyMultiplicity(main.sourceMultiplicity) ||
      !isManyMultiplicity(main.targetMultiplicity)
    )
      continue;
    const source = byId.get(nodeIdOf(main.sourceNodeId, main.sourceId));
    const target = byId.get(nodeIdOf(main.targetNodeId, main.targetId));
    if (!source || !target || source === target) continue;

    const attrs: any[] = assoc.attributes || [];
    const isPureJoinTable = attrs.every(
      (a) => /id$/i.test(a.name || '') && String(a.name).toLowerCase() !== 'id',
    );

    if (isPureJoinTable) {
      excluded.add(assoc.id);
      const used = new Set<string>();
      const columnFor = (cls: any) => {
        const snake = classSnake(cls.name);
        const attr = attrs.find((a) => {
          const base = toSnakeCase(a.name).replace(/^id_|_id$/g, '');
          return !used.has(a.name) && toSingular(base) === toSingular(snake);
        });
        if (attr) used.add(attr.name);
        return attr ? toSnakeCase(attr.name) : `${snake}_id`;
      };
      joinTables.set(main.id, {
        tableName: classSnake(assoc.name),
        sourceColumn: columnFor(source),
        targetColumn: columnFor(target),
      });
    } else {
      replaced.add(main.id);
      for (const end of [source, target]) {
        virtual.push({
          id: `${main.id}_${end.id}`,
          sourceNodeId: assoc.id,
          targetNodeId: end.id,
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '1',
        });
      }
    }
  }

  return {
    classNodes: valid.filter((n) => !excluded.has(n.id)),
    connections: [
      ...connections.filter((c) => !replaced.has(c.id)),
      ...virtual,
    ],
    generalizations,
    joinTables,
  };
}

/** Tabla de unión para una relación M:N sin tabla intermedia en el diagrama. */
export function defaultJoinTable(
  sourceClassName: string,
  targetClassName: string,
): JoinTableSpec {
  const source = classSnake(sourceClassName);
  const target = classSnake(targetClassName);
  return {
    tableName: `${source}_${target}`,
    sourceColumn: `${source}_id`,
    targetColumn: `${target}_id`,
  };
}

/**
 * Herencia JOINED: cada subclase extiende a su padre, comparte el id de la raíz de la jerarquía
 * y no repite los campos heredados. Se ignoran los ciclos y la herencia múltiple.
 */
export function applyInheritance(
  classes: JavaClassMeta[],
  generalizations: [string, string][],
  nodeIdToName: Map<string, string>,
): void {
  const byName = new Map(classes.map((c) => [c.className, c]));
  for (const [childId, parentId] of generalizations) {
    const child = byName.get(nodeIdToName.get(childId) || '');
    const parent = byName.get(nodeIdToName.get(parentId) || '');
    if (child && parent && child !== parent && !child.parentClassName) {
      child.parentClassName = parent.className;
    }
  }

  // Ancestros desde el padre hasta la raíz; null si hay un ciclo
  const ancestorsOf = (cls: JavaClassMeta): JavaClassMeta[] | null => {
    const chain: JavaClassMeta[] = [];
    const seen = new Set([cls.className]);
    let name = cls.parentClassName;
    while (name) {
      const ancestor = byName.get(name);
      if (!ancestor || seen.has(name)) return null;
      seen.add(name);
      chain.push(ancestor);
      name = ancestor.parentClassName;
    }
    return chain;
  };

  const chains = new Map<JavaClassMeta, JavaClassMeta[]>();
  for (const cls of classes) {
    if (!cls.parentClassName) continue;
    const chain = ancestorsOf(cls);
    if (chain) chains.set(cls, chain);
    else delete cls.parentClassName;
  }

  for (const [cls, chain] of chains) {
    const root = chain[chain.length - 1];
    root.isInheritanceRoot = true;
    const fromRoot = [...chain].reverse();
    cls.inheritedFields = fromRoot.flatMap((a) =>
      a.fields.filter((f) => !f.isId),
    );
    cls.inheritedRelationships = fromRoot.flatMap((a) =>
      a.relationships.filter(
        (r) =>
          r.type === 'MANY_TO_ONE' ||
          r.type === 'ONE_TO_ONE' ||
          (r.type === 'MANY_TO_MANY' && r.isOwner),
      ),
    );
    const inheritedNames = new Set(cls.inheritedFields.map((f) => f.name));
    cls.fields = cls.fields.filter(
      (f) => !f.isId && !inheritedNames.has(f.name),
    );
    cls.idField = { ...root.idField };
    cls.hasDates = cls.fields.some(
      (f) => f.javaType === 'LocalDate' || f.javaType === 'LocalDateTime',
    );
    cls.hasBigDecimals = cls.fields.some((f) => f.javaType === 'BigDecimal');
  }
}

/** Tablas de unión que crea la migración: una por cada M:N, declarada en su lado dueño. */
export function collectJoinTables(classes: JavaClassMeta[]): JoinTableMeta[] {
  const result = new Map<string, JoinTableMeta>();
  for (const cls of classes) {
    for (const rel of cls.relationships) {
      if (rel.type !== 'MANY_TO_MANY' || !rel.isOwner || !rel.joinTable)
        continue;
      const target = classes.find((c) => c.className === rel.targetClassName);
      if (!target || result.has(rel.joinTable)) continue;
      result.set(rel.joinTable, {
        tableName: rel.joinTable,
        sourceTable: cls.tableName,
        sourceColumn: rel.joinColumnName!,
        sourceIdColumn: cls.idField.sqlColumnName,
        sourceSqlType: idReferenceSqlType(cls.idField),
        targetTable: target.tableName,
        targetColumn: rel.inverseJoinColumnName!,
        targetIdColumn: target.idField.sqlColumnName,
        targetSqlType: idReferenceSqlType(target.idField),
      });
    }
  }
  return Array.from(result.values());
}
