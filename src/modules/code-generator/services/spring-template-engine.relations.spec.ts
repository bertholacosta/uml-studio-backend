import { SpringTemplateEngineService } from './spring-template-engine.service';

const node = (
  id: string,
  name: string,
  attrs: [string, string][],
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  position: { x: 0, y: 0 },
  attributes: attrs.map(([n, type]) => ({ name: n, type })),
  methods: [],
  ...extra,
});
const conn = (
  id: string,
  s: string,
  t: string,
  type: string,
  sm = '',
  tm = '',
  extra: Record<string, unknown> = {},
) => ({
  id,
  sourceNodeId: s,
  targetNodeId: t,
  sourceId: `${s}_right`,
  targetId: `${t}_left`,
  type,
  sourceMultiplicity: sm,
  targetMultiplicity: tm,
  ...extra,
});

describe('SpringTemplateEngineService: herencia y relaciones', () => {
  const engine = new SpringTemplateEngineService();
  const generate = (nodes: any[], connections: any[]) => {
    const { files, context } = engine.generateProjectFiles(
      { packageName: 'com.demo.app' } as any,
      nodes,
      connections,
    );
    const file = (suffix: string) =>
      files.find((f) => f.path.endsWith(suffix))?.content ?? '';
    return { files, context, file, sql: file('V1__create_tables.sql') };
  };

  it('genera la herencia con extends y JOINED, compartiendo el id del padre', () => {
    const { file, sql } = generate(
      [
        node('p', 'Persona', [
          ['id', 'Long'],
          ['nombre', 'String'],
        ]),
        node('e', 'Empleado', [
          ['id', 'Long'],
          ['nombre', 'String'],
          ['cargo', 'String'],
        ]),
      ],
      [conn('g', 'e', 'p', 'generalization')],
    );

    expect(file('entities/Persona.java')).toContain(
      '@Inheritance(strategy = InheritanceType.JOINED)',
    );
    const empleado = file('entities/Empleado.java');
    expect(empleado).toContain('public class Empleado extends Persona');
    expect(empleado).toContain('@PrimaryKeyJoinColumn(name = "id")');
    // Ni id propio ni campos repetidos del padre, ni una relación 1:N inventada
    expect(empleado).not.toContain('@Id');
    expect(empleado).not.toMatch(/private String nombre/);
    expect(empleado).not.toContain('personaList');
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS "empleado" \(\n\s+"id" BIGINT PRIMARY KEY/,
    );
    expect(sql).toContain(
      'REFERENCES "persona" ("id")\n            ON DELETE CASCADE',
    );
    // Los DTOs de la subclase incluyen lo heredado
    expect(file('dtos/CreateEmpleadoDto.java')).toContain(
      'private String nombre;',
    );
    expect(file('dtos/EmpleadoResponseDto.java')).toContain(
      '.id(entity.getId())',
    );
  });

  it('usa la tabla intermedia pura del diagrama como única tabla de unión del M:N', () => {
    const { files, file, sql, context } = generate(
      [
        node('pr', 'Producto', [['id', 'Long']]),
        node('ca', 'Categoria', [['id', 'Long']]),
        node('an', '', [], { isAnchor: true }),
        node(
          'pc',
          'ProductoCategoria',
          [
            ['productoId', 'Long'],
            ['categoriaId', 'Long'],
          ],
          { assocMainConnId: 'm' },
        ),
      ],
      [
        conn('m', 'pr', 'ca', 'association', '*', '*', {
          assocAnchorNodeId: 'an',
        }),
        conn('l', 'an', 'pc', 'association_class'),
      ],
    );

    expect(files.some((f) => f.path.includes('ProductoCategoria'))).toBe(false);
    expect(file('entities/Producto.java')).toContain(
      'name = "producto_categoria",\n        joinColumns = @JoinColumn(name = "producto_id"),\n        inverseJoinColumns = @JoinColumn(name = "categoria_id")',
    );
    expect(file('entities/Categoria.java')).toContain(
      '@ManyToMany(mappedBy = "categoriaList")',
    );
    expect(file('entities/Categoria.java')).not.toContain('@JoinTable');
    expect(context.joinTables).toHaveLength(1);
    expect(sql).toContain('PRIMARY KEY ("producto_id", "categoria_id")');
    // La relación se gestiona con una lista de ids en el lado dueño
    expect(file('dtos/CreateProductoDto.java')).toContain(
      'private List<Long> categoriaIds;',
    );
    expect(file('services/ProductoService.java')).toContain(
      'categoriaRepository.findAllById(dto.getCategoriaIds())',
    );
  });

  it('convierte una clase de asociación con atributos propios en entidad con dos @ManyToOne', () => {
    const { file, context } = generate(
      [
        node('es', 'Estudiante', [['id', 'Long']]),
        node('ma', 'Materia', [['id', 'Long']]),
        node(
          'dm',
          'Inscripcion',
          [
            ['estudianteId', 'Long'],
            ['materiaId', 'Long'],
            ['nota', 'Integer'],
          ],
          { assocMainConnId: 'm' },
        ),
      ],
      [conn('m', 'es', 'ma', 'association', '*', '*')],
    );

    const inscripcion = file('entities/Inscripcion.java');
    expect(inscripcion).toContain('private Integer nota;');
    expect(inscripcion).toContain('@JoinColumn(name = "estudiante_id")');
    expect(inscripcion).toContain('@JoinColumn(name = "materia_id")');
    expect(file('entities/Estudiante.java')).not.toContain('@ManyToMany');
    expect(context.joinTables).toHaveLength(0);
  });

  it('genera una tabla de unión por defecto para un M:N sin tabla intermedia', () => {
    const { file, context } = generate(
      [
        node('d', 'Docente', [['id', 'Long']]),
        node('m', 'Materia', [['id', 'Long']]),
      ],
      [conn('r', 'd', 'm', 'association', '0..*', '1..*')],
    );
    expect(file('entities/Docente.java')).toContain('name = "docente_materia"');
    expect(context.joinTables.map((j) => j.tableName)).toEqual([
      'docente_materia',
    ]);
  });

  it('no genera columnas para dependencias ni realizaciones', () => {
    const { file } = generate(
      [
        node('a', 'Pedido', [['id', 'Long']]),
        node('b', 'Notificador', [['id', 'Long']]),
      ],
      [conn('d', 'a', 'b', 'dependency'), conn('r', 'b', 'a', 'realization')],
    );
    expect(file('entities/Pedido.java')).not.toMatch(/notificador/i);
    expect(file('entities/Notificador.java')).not.toMatch(/pedido/i);
  });

  it('mapea el tipo Text a una columna TEXT y deja que Flyway gestione el esquema', () => {
    const { file, sql } = generate(
      [
        node('n', 'Nota', [
          ['id', 'Long'],
          ['contenido', 'Text'],
        ]),
      ],
      [],
    );
    expect(file('entities/Nota.java')).toContain('columnDefinition = "TEXT"');
    expect(sql).toContain('"contenido" TEXT');
    expect(file('application.yml')).toContain('ddl-auto: validate');
  });

  it('incluye el Gradle Wrapper y deriva el groupId del paquete', () => {
    const { files, file } = generate([node('n', 'Nota', [['id', 'Long']])], []);
    const jar = files.find(
      (f) => f.path === 'gradle/wrapper/gradle-wrapper.jar',
    );
    expect(jar?.encoding).toBe('base64');
    expect(Buffer.from(jar!.content, 'base64').subarray(0, 2).toString()).toBe(
      'PK',
    );
    expect(files.find((f) => f.path === 'gradlew')?.executable).toBe(true);
    expect(file('build.gradle')).toContain("group = 'com.demo'");
  });
});
