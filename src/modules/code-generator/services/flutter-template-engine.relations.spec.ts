import { SpringTemplateEngineService } from './spring-template-engine.service';
import { FlutterTemplateEngineService } from './flutter-template-engine.service';

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
) => ({
  id,
  sourceNodeId: s,
  targetNodeId: t,
  sourceId: `${s}_right`,
  targetId: `${t}_left`,
  type,
  sourceMultiplicity: sm,
  targetMultiplicity: tm,
});

describe('FlutterTemplateEngineService: contrato con la API generada', () => {
  const nodes = [
    node('p', 'Persona', [
      ['id', 'Long'],
      ['nombre', 'String'],
    ]),
    node('e', 'Empleado', [['cargo', 'String']]),
    node('pr', 'Producto', [
      ['id', 'Long'],
      ['nombre', 'String'],
    ]),
    node('c', 'Categoria', [
      ['id', 'Long'],
      ['nombre', 'String'],
    ]),
    node('pe', 'Pedido', [
      ['id', 'Long'],
      ['fecha', 'LocalDate'],
      ['creado', 'LocalDateTime'],
    ]),
  ];
  const connections = [
    conn('g', 'e', 'p', 'generalization'),
    conn('m', 'pr', 'c', 'association', '*', '*'),
  ];

  const { context } = new SpringTemplateEngineService().generateProjectFiles(
    {} as any,
    nodes,
    connections,
  );
  const files = new FlutterTemplateEngineService().generateFlutterProjectFiles(
    context,
    '',
  );
  const file = (suffix: string) =>
    files.find((f) => f.path.endsWith(suffix))?.content ?? '';

  /** El bloque de una entidad dentro de schema.dart. */
  const entity = (name: string) => {
    const schema = file('lib/schema.dart');
    const start = schema.indexOf(`name: '${name}',`);
    return start < 0
      ? ''
      : schema.slice(start, schema.indexOf('\n  ),', start));
  };

  it('la subclase expone el id y los campos heredados', () => {
    const empleado = entity('Empleado');
    expect(empleado).toContain("Field('id', 'int', isId: true),");
    expect(empleado).toContain("Field('nombre', 'text'),");
    expect(empleado).toContain("Field('cargo', 'text'),");
  });

  it('el lado dueño del M:N lleva la lista de ids de la otra clase', () => {
    expect(entity('Producto')).toContain(
      "Field('categoriaIds', 'ids', ref: 'Categoria'),",
    );
    expect(entity('Categoria')).not.toContain('productoIds');
    // El formulario los envía como lista, no como texto
    expect(file('screens/record_form.dart')).toContain(
      'value = (_values[field.name] as Set<String>).toList();',
    );
  });

  it('distingue LocalDate (sin hora) de LocalDateTime', () => {
    const pedido = entity('Pedido');
    expect(pedido).toContain("Field('fecha', 'date'),");
    expect(pedido).toContain("Field('creado', 'datetime'),");
    expect(file('screens/record_form.dart')).toContain(
      "field.type == 'date' ? iso.substring(0, 10) : iso.substring(0, 19)",
    );
  });

  it('no registra peticiones: el token nunca llega a los registros', () => {
    expect(file('lib/api.dart')).not.toContain('LogInterceptor');
  });

  it('no genera archivos del SDK de Flutter ni paquetes de Markdown', () => {
    expect(files.some((f) => f.path.endsWith('engine.version'))).toBe(false);
    expect(file('pubspec.yaml')).not.toContain('flutter_markdown');
  });
});
