import * as path from 'path';
import { ProjectContext, idReferenceSqlType } from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlywayMigration(context: ProjectContext): string {
  const templatePath = path.join(__dirname, 'flyway.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const tables: { tableName: string; columnsSql: string }[] = [];
  const foreignKeys: { sql: string }[] = [];

  // 1. Tablas
  for (const meta of context.classes) {
    const columnDefs: string[] = [];
    const addedColumns = new Set<string>();

    // Clave primaria: una subclase (herencia JOINED) reutiliza el id de su padre
    if (meta.parentClassName) {
      columnDefs.push(
        `    "${meta.idField.sqlColumnName}" ${idReferenceSqlType(meta.idField)} PRIMARY KEY`,
      );
    } else if (meta.idField.javaType === 'UUID') {
      columnDefs.push(
        `    "${meta.idField.sqlColumnName}" UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
      );
    } else {
      columnDefs.push(
        `    "${meta.idField.sqlColumnName}" BIGSERIAL PRIMARY KEY`,
      );
    }
    addedColumns.add(meta.idField.sqlColumnName);

    // Campos normales
    for (const field of meta.fields) {
      if (field.isId) continue;
      if (addedColumns.has(field.sqlColumnName)) continue;

      let col = `    "${field.sqlColumnName}" ${field.sqlType}`;
      if (!field.isNullable) col += ' NOT NULL';
      if (field.isUnique) col += ' UNIQUE';
      columnDefs.push(col);
      addedColumns.add(field.sqlColumnName);
    }

    // Columnas de claves foráneas
    for (const rel of meta.relationships) {
      if (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE') {
        const joinCol = rel.joinColumnName || `${rel.fieldName}_id`;
        if (!addedColumns.has(joinCol)) {
          const targetMeta = context.classes.find(
            (c) => c.className === rel.targetClassName,
          );
          let targetSqlType = 'UUID';
          if (targetMeta) {
            targetSqlType =
              targetMeta.idField.javaType === 'UUID'
                ? 'UUID'
                : targetMeta.idField.sqlType || 'BIGINT';
          }
          columnDefs.push(`    "${joinCol}" ${targetSqlType}`);
          addedColumns.add(joinCol);
        }
      }
    }

    tables.push({
      tableName: meta.tableName,
      columnsSql: columnDefs.join(',\n'),
    });
  }

  // 1.1 Tablas de unión de las relaciones muchos a muchos (clave primaria compuesta)
  for (const join of context.joinTables) {
    tables.push({
      tableName: join.tableName,
      columnsSql: [
        `    "${join.sourceColumn}" ${join.sourceSqlType} NOT NULL`,
        `    "${join.targetColumn}" ${join.targetSqlType} NOT NULL`,
        `    PRIMARY KEY ("${join.sourceColumn}", "${join.targetColumn}")`,
      ].join(',\n'),
    });
    foreignKeys.push(
      {
        sql: foreignKeySql(
          join.tableName,
          join.sourceColumn,
          join.sourceTable,
          join.sourceIdColumn,
          'CASCADE',
        ),
      },
      {
        sql: foreignKeySql(
          join.tableName,
          join.targetColumn,
          join.targetTable,
          join.targetIdColumn,
          'CASCADE',
        ),
      },
    );
  }

  // 2. Claves foráneas
  for (const meta of context.classes) {
    // La fila de la subclase se borra con la de su padre
    if (meta.parentClassName) {
      const parent = context.classes.find(
        (c) => c.className === meta.parentClassName,
      );
      if (parent) {
        foreignKeys.push({
          sql: foreignKeySql(
            meta.tableName,
            meta.idField.sqlColumnName,
            parent.tableName,
            parent.idField.sqlColumnName,
            'CASCADE',
          ),
        });
      }
    }

    for (const rel of meta.relationships) {
      if (rel.type === 'MANY_TO_ONE' || rel.type === 'ONE_TO_ONE') {
        const joinCol = rel.joinColumnName || `${rel.fieldName}_id`;
        const targetMeta = context.classes.find(
          (c) => c.className === rel.targetClassName,
        );
        const targetTable = targetMeta
          ? targetMeta.tableName
          : rel.targetClassName.toLowerCase();
        const targetIdCol = targetMeta
          ? targetMeta.idField.sqlColumnName
          : 'id';
        foreignKeys.push({
          sql: foreignKeySql(
            meta.tableName,
            joinCol,
            targetTable,
            targetIdCol,
            'SET NULL',
          ),
        });
      }
    }
  }

  // 3. Semilla de autenticación
  let hasSeed = false;
  let seedTable = '';
  let seedCols = '';
  let seedVals = '';

  if (context.hasAuth && context.userClass) {
    const u = context.userClass;
    hasSeed = true;
    seedTable = u.tableName;

    const cols: string[] = [];
    const vals: string[] = [];

    for (const f of u.fields) {
      if (f.isId) {
        continue;
      }
      cols.push(`"${f.sqlColumnName}"`);
      if (
        f.name.toLowerCase() === 'email' ||
        f.name.toLowerCase() === 'correo'
      ) {
        vals.push("'admin@studio.com'");
      } else if (
        f.name.toLowerCase() === 'password' ||
        f.name.toLowerCase() === 'contrasena' ||
        f.name.toLowerCase() === 'contraseña' ||
        f.name.toLowerCase() === 'clave' ||
        f.name.toLowerCase() === 'pass'
      ) {
        vals.push(
          "'$2a$10$P.ogHfHufpwpeGew6Mz.2uBmnnyScQ0sDdLXmtlr8gOhQThCb0fZK'",
        );
      } else if (
        f.name.toLowerCase().includes('rol') ||
        f.name.toLowerCase().includes('role')
      ) {
        vals.push("'ADMIN'");
      } else if (
        f.name.toLowerCase() === 'username' ||
        f.name.toLowerCase() === 'usuario'
      ) {
        vals.push("'admin'");
      } else if (
        f.name.toLowerCase().includes('nombre') ||
        f.name.toLowerCase().includes('name')
      ) {
        vals.push("'Administrador'");
      } else if (
        f.name.toLowerCase().includes('telefono') ||
        f.name.toLowerCase().includes('phone')
      ) {
        vals.push("'70000000'");
      } else if (
        f.name.toLowerCase().includes('nit') ||
        f.name.toLowerCase().includes('ci') ||
        f.name.toLowerCase().includes('documento')
      ) {
        vals.push("'1234567'");
      } else if (f.javaType === 'String') {
        vals.push(`'${f.name}_admin'`);
      } else if (
        f.javaType === 'Integer' ||
        f.javaType === 'Long' ||
        f.javaType === 'Double' ||
        f.javaType === 'BigDecimal'
      ) {
        vals.push('0');
      } else if (f.javaType === 'Boolean') {
        vals.push('true');
      } else if (f.javaType === 'LocalDate') {
        vals.push('CURRENT_DATE');
      } else if (f.javaType === 'LocalDateTime') {
        vals.push('CURRENT_TIMESTAMP');
      } else if (f.javaType === 'UUID') {
        vals.push('gen_random_uuid()');
      } else {
        vals.push("'admin'");
      }
    }

    seedCols = cols.join(', ');
    seedVals = vals.join(', ');
  }

  return renderMustache(mustacheTemplate, {
    projectName: context.projectName,
    generatedDate: new Date().toISOString(),
    tables,
    hasForeignKeys: foreignKeys.length > 0,
    foreignKeys,
    hasSeed,
    seedTable,
    seedCols,
    seedVals,
  });
}

/** Restricción de clave foránea idempotente (la migración puede reaplicarse sobre una base existente). */
function foreignKeySql(
  table: string,
  column: string,
  refTable: string,
  refColumn: string,
  onDelete: 'CASCADE' | 'SET NULL',
): string {
  const fkName = `fk_${table}_${column}`.slice(0, 63);
  return `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fkName}') THEN
        ALTER TABLE "${table}"
            ADD CONSTRAINT "${fkName}"
            FOREIGN KEY ("${column}")
            REFERENCES "${refTable}" ("${refColumn}")
            ON DELETE ${onDelete};
    END IF;
END $$;`;
}
