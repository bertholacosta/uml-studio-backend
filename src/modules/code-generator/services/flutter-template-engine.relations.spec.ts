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

  it('la subclase expone el id y los campos heredados y se borra por id', () => {
    const model = file('empleado/data/models/empleado_model.dart');
    expect(model).toContain("id: (json['id']");
    expect(model).toContain("nombre: (json['nombre']");
    expect(file('empleado/data/models/empleado_request_model.dart')).toContain(
      'final String? nombre;',
    );
    expect(
      file('empleado/presentation/pages/empleado_list_page.dart'),
    ).toContain('_confirmDelete(context, item.id.toString())');
  });

  it('el lado dueño del M:N envía y recibe la lista de ids', () => {
    expect(file('producto/data/models/producto_request_model.dart')).toContain(
      'final List<String>? categoriaIds;',
    );
    expect(file('producto/data/models/producto_model.dart')).toContain(
      "categoriaIds: (json['categoriaIds'] as List?)?.map((e) => e.toString()).toList() ?? const [],",
    );
    expect(
      file('categoria/data/models/categoria_request_model.dart'),
    ).not.toContain('productoIds');
  });

  it('serializa LocalDate sin hora y LocalDateTime completo', () => {
    const request = file('pedido/data/models/pedido_request_model.dart');
    expect(request).toContain(
      "map['fecha'] = fecha!.toIso8601String().substring(0, 10);",
    );
    expect(request).toContain("map['creado'] = creado!.toIso8601String();");
  });

  it('solo registra peticiones en depuración y sin cabeceras', () => {
    const client = file('core/network/api_client.dart');
    expect(client).toContain('if (kDebugMode)');
    expect(client).toContain('requestHeader: false');
  });

  it('no genera archivos del SDK de Flutter ni el paquete descontinuado flutter_markdown', () => {
    expect(files.some((f) => f.path.endsWith('engine.version'))).toBe(false);
    const pubspec = file('pubspec.yaml');
    expect(pubspec).toContain('flutter_markdown_plus:');
    expect(pubspec).not.toMatch(/\n {2}flutter_markdown:/);
  });
});
