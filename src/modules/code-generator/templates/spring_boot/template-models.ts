export interface JavaField {
  name: string;
  javaType: string;
  sqlColumnName: string;
  sqlType: string;
  isId: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isAutoIncrement: boolean;
  getterName: string;
  setterName: string;
  isForeignKey?: boolean;
  /** Tipo «Text» del diagrama: VARCHAR ilimitado (columna TEXT en PostgreSQL). */
  isText?: boolean;
}

export interface JavaRelationship {
  type: 'MANY_TO_ONE' | 'ONE_TO_MANY' | 'ONE_TO_ONE' | 'MANY_TO_MANY';
  targetClassName: string;
  targetPackage: string;
  fieldName: string;
  joinColumnName?: string;
  mappedBy?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  cascade?: string;
  targetIdType?: string;
  targetIdGetterName?: string;
  targetIdSetterName?: string;
  /** MANY_TO_MANY: el lado dueño declara la tabla de unión; el otro usa mappedBy. */
  isOwner?: boolean;
  joinTable?: string;
  inverseJoinColumnName?: string;
  /** MANY_TO_MANY dueño: nombre del campo de ids en los DTOs (p. ej. categoriaIds). */
  idsFieldName?: string;
}

export interface JavaClassMeta {
  className: string;
  tableName: string;
  packageName: string;
  basePackage: string;
  idField: JavaField;
  fields: JavaField[];
  methods: {
    name: string;
    parameters: string;
    returnType: string;
  }[];
  relationships: JavaRelationship[];
  hasDates: boolean;
  hasUuids: boolean;
  hasBigDecimals: boolean;
  /** Herencia JOINED: clase padre directa (la subclase hereda su id). */
  parentClassName?: string;
  /** Raíz de una jerarquía: lleva @Inheritance(strategy = JOINED). */
  isInheritanceRoot?: boolean;
  /** Campos y relaciones de los ancestros, para DTOs y servicios de la subclase. */
  inheritedFields?: JavaField[];
  inheritedRelationships?: JavaRelationship[];
}

/** Tabla de unión de una relación muchos a muchos (la tabla intermedia del diagrama). */
export interface JoinTableMeta {
  tableName: string;
  sourceTable: string;
  sourceColumn: string;
  sourceIdColumn: string;
  sourceSqlType: string;
  targetTable: string;
  targetColumn: string;
  targetIdColumn: string;
  targetSqlType: string;
}

export interface ProjectContext {
  packageName: string;
  artifactId: string;
  groupId: string;
  projectName: string;
  javaVersion: string;
  springBootVersion: string;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  databasePort: number;
  serverPort: number;
  classes: JavaClassMeta[];
  hasAuth?: boolean;
  userClass?: JavaClassMeta;
  joinTables: JoinTableMeta[];
}

export function isUserClass(target: string | JavaClassMeta): boolean {
  const name = typeof target === 'string' ? target : target.className;
  const lower = name.toLowerCase().trim();
  const userKeywords = [
    'user',
    'usuario',
    'users',
    'usuarios',
    'account',
    'cuenta',
    'cuentas',
    'accounts',
    'appuser',
    'customuser',
    'cliente',
    'authuser',
    'persona',
  ];
  return (
    userKeywords.includes(lower) ||
    lower.endsWith('user') ||
    lower.endsWith('usuario')
  );
}

export function hasEmailField(meta: JavaClassMeta): boolean {
  return meta.fields.some((f) => {
    const lower = f.name.toLowerCase();
    return (
      lower === 'email' ||
      lower === 'correo' ||
      lower === 'correoelectronico' ||
      lower === 'mail' ||
      lower === 'username' ||
      lower === 'usuario'
    );
  });
}

export function hasPasswordField(meta: JavaClassMeta): boolean {
  return meta.fields.some((f) => {
    const lower = f.name.toLowerCase();
    return (
      lower === 'password' ||
      lower === 'contrasena' ||
      lower === 'contraseña' ||
      lower === 'clave' ||
      lower === 'pass' ||
      lower === 'pwd'
    );
  });
}

export function isAuthEligibleUserClass(meta: JavaClassMeta): boolean {
  return isUserClass(meta) && hasEmailField(meta) && hasPasswordField(meta);
}

export function toPascalCase(str: string): string {
  if (!str) return 'Entity';
  const clean = str.replace(/[^a-zA-Z0-9_]/g, '');
  return clean
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toSnakeCase(str: string): string {
  if (!str) return 'table_name';
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function toSingular(str: string): string {
  if (!str) return str;
  if (str.endsWith('ies')) return str.slice(0, -3) + 'y';
  if (str.endsWith('es') && str.length > 3) return str.slice(0, -2);
  if (str.endsWith('s') && str.length > 2 && !str.endsWith('ss'))
    return str.slice(0, -1);
  return str;
}

export function mapTypeToSql(javaType: string): string {
  const norm = (javaType || 'String').trim();
  switch (norm.toLowerCase()) {
    case 'uuid':
      return 'UUID';
    case 'string':
    case 'text':
      return 'VARCHAR(255)';
    case 'int':
    case 'integer':
      return 'INTEGER';
    case 'long':
      return 'BIGINT';
    case 'boolean':
    case 'bool':
      return 'BOOLEAN';
    case 'double':
      return 'DOUBLE PRECISION';
    case 'float':
      return 'REAL';
    case 'bigdecimal':
      return 'NUMERIC(15, 2)';
    case 'localdate':
    case 'date':
      return 'DATE';
    case 'localdatetime':
    case 'timestamp':
      return 'TIMESTAMP';
    case 'byte[]':
      return 'BYTEA';
    default:
      return 'VARCHAR(255)';
  }
}

/** Tipo SQL de una columna que referencia el id de otra tabla. */
export function idReferenceSqlType(idField: JavaField): string {
  return idField.javaType === 'UUID'
    ? 'UUID'
    : idField.javaType === 'Integer'
      ? 'INTEGER'
      : 'BIGINT';
}

/**
 * Vista de una clase para DTOs, servicios y controladores: una subclase expone
 * también el id, los campos y las relaciones de sus ancestros.
 */
export function withInherited(meta: JavaClassMeta): JavaClassMeta {
  if (!meta.parentClassName) return meta;
  const fields = [
    meta.idField,
    ...(meta.inheritedFields || []),
    ...meta.fields,
  ];
  return {
    ...meta,
    fields,
    relationships: [
      ...(meta.inheritedRelationships || []),
      ...meta.relationships,
    ],
    hasDates: fields.some(
      (f) => f.javaType === 'LocalDate' || f.javaType === 'LocalDateTime',
    ),
    hasBigDecimals: fields.some((f) => f.javaType === 'BigDecimal'),
  };
}

export function normalizeJavaType(type: string): string {
  if (!type) return 'String';
  const trimmed = type.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'uuid') return 'UUID';
  if (lower === 'string' || lower === 'text') return 'String';
  if (lower === 'integer' || lower === 'int') return 'Integer';
  if (lower === 'long') return 'Long';
  if (lower === 'boolean' || lower === 'bool') return 'Boolean';
  if (lower === 'double') return 'Double';
  if (lower === 'float') return 'Float';
  if (lower === 'bigdecimal') return 'BigDecimal';
  if (lower === 'localdate' || lower === 'date') return 'LocalDate';
  if (lower === 'localdatetime' || lower === 'timestamp')
    return 'LocalDateTime';
  if (lower === 'byte[]') return 'byte[]';

  return trimmed;
}

export function getUserEmailField(userClass: JavaClassMeta): JavaField {
  return (
    userClass.fields.find(
      (f) =>
        f.name.toLowerCase() === 'email' ||
        f.name.toLowerCase() === 'correo' ||
        f.name.toLowerCase() === 'correoelectronico' ||
        f.name.toLowerCase() === 'mail',
    ) ||
    userClass.fields.find(
      (f) =>
        f.name.toLowerCase() === 'username' ||
        f.name.toLowerCase() === 'usuario',
    ) ||
    userClass.fields.find((f) => !f.isId) ||
    userClass.idField
  );
}

export function getUserPasswordField(userClass: JavaClassMeta): JavaField {
  return (
    userClass.fields.find(
      (f) =>
        f.name.toLowerCase() === 'password' ||
        f.name.toLowerCase() === 'contrasena' ||
        f.name.toLowerCase() === 'contraseña' ||
        f.name.toLowerCase() === 'clave' ||
        f.name.toLowerCase() === 'pass' ||
        f.name.toLowerCase() === 'pwd',
    ) || {
      name: 'password',
      javaType: 'String',
      sqlColumnName: 'password',
      sqlType: 'VARCHAR(255)',
      isId: false,
      isNullable: false,
      isUnique: false,
      isAutoIncrement: false,
      getterName: 'getPassword',
      setterName: 'setPassword',
    }
  );
}

export function getUserUsernameField(
  userClass: JavaClassMeta,
): JavaField | undefined {
  return userClass.fields.find(
    (f) =>
      f.name.toLowerCase() === 'username' || f.name.toLowerCase() === 'usuario',
  );
}
