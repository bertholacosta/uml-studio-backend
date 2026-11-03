import {
  applyOperations,
  dropUnrequestedOperations,
  DiagramOperation,
} from './diagram-operations';
import { resolveManyToManyRelationships } from './many-to-many.resolver';
import { UmlClassNode, UmlConnection } from './uml-diagram.types';

const node = (
  id: string,
  name: string,
  attrs: string[] = [],
  extra: Partial<UmlClassNode> = {},
): UmlClassNode => ({
  id,
  name,
  position: { x: 100, y: 100 },
  attributes: attrs.map((a) => ({ name: a, type: 'String' })),
  methods: [],
  ...extra,
});

const conn = (
  id: string,
  s: string,
  t: string,
  sm = '1',
  tm = '0..*',
  extra: Partial<UmlConnection> = {},
): UmlConnection => ({
  id,
  sourceNodeId: s,
  targetNodeId: t,
  sourceId: `${s}_right`,
  targetId: `${t}_left`,
  type: 'association',
  sourceMultiplicity: sm,
  targetMultiplicity: tm,
  ...extra,
});

/** Diagrama Alumno *—* Curso ya resuelto con tabla intermedia, ancla y «link». */
const manyToManyDiagram = () =>
  resolveManyToManyRelationships(
    [
      node('a', 'Alumno', ['id']),
      node('c', 'Curso', ['id']),
      node('p', 'Profesor'),
    ],
    [conn('ac', 'a', 'c', '*', '*'), conn('pc', 'p', 'c', '1', '*')],
  );

describe('applyOperations', () => {
  it('crea una clase nueva sin tocar las existentes', () => {
    const res = applyOperations(
      [node('a', 'Alumno', ['id'])],
      [],
      [
        {
          op: 'add_class',
          name: 'Factura',
          attributes: [{ name: 'total', type: 'Double' }],
        },
      ],
    );
    expect(res.nodes.map((n) => n.name)).toEqual(['Alumno', 'Factura']);
    expect(res.nodes[1].position.x).toBeGreaterThan(res.nodes[0].position.x);
  });

  it('fusiona los atributos si el modelo «crea» una clase que ya existe', () => {
    const res = applyOperations(
      [node('a', 'Alumno', ['id'])],
      [],
      [
        {
          op: 'add_class',
          name: 'Alumno',
          attributes: [{ name: 'email', type: 'String' }],
        },
      ],
    );
    expect(res.nodes).toHaveLength(1);
    expect(res.nodes[0].attributes.map((a) => a.name)).toEqual(['id', 'email']);
  });

  it('localiza la clase por nombre aproximado y edita solo los atributos indicados', () => {
    const res = applyOperations(
      [node('d', 'DetalleCompra', ['id', 'precio', 'nota'])],
      [],
      [
        {
          op: 'update_class',
          target: 'detalle de compra',
          removeAttributes: ['nota'],
          updateAttributes: [
            { name: 'precio', newName: 'precioUnitario', type: 'BigDecimal' },
          ],
          addAttributes: [{ name: 'cantidad', type: 'Integer' }],
        },
      ],
    );
    expect(res.nodes[0].attributes).toEqual([
      { name: 'id', type: 'String' },
      { name: 'precioUnitario', type: 'BigDecimal' },
      { name: 'cantidad', type: 'Integer' },
    ]);
  });

  it('vacía los atributos conservando la clase y el resto del diagrama', () => {
    const res = applyOperations(
      [node('c', 'Cliente', ['id', 'email']), node('p', 'Pedido', ['id'])],
      [conn('r', 'p', 'c')],
      [{ op: 'update_class', target: 'Cliente', clearAttributes: true }],
    );
    expect(res.nodes).toHaveLength(2);
    expect(res.nodes.find((n) => n.id === 'c')?.attributes).toEqual([]);
    expect(res.connections).toHaveLength(1);
  });

  it('elimina una clase con sus relaciones', () => {
    const res = applyOperations(
      [node('c', 'Compra'), node('d', 'DetalleCompra')],
      [conn('r', 'c', 'd')],
      [{ op: 'remove_class', target: 'Detalles de compra' }],
    );
    expect(res.nodes.map((n) => n.name)).toEqual(['Compra']);
    expect(res.connections).toHaveLength(0);
  });

  it('al eliminar una clase de una relación M:N quita también la tabla intermedia y el ancla', () => {
    const d = manyToManyDiagram();
    const res = applyOperations(d.nodes, d.connections, [
      { op: 'remove_class', target: 'Alumno' },
    ]);
    expect(res.nodes.map((n) => n.name).sort()).toEqual(['Curso', 'Profesor']);
    expect(res.nodes.some((n) => n.isAnchor)).toBe(false);
    expect(res.connections.map((c) => c.id)).toEqual(['pc']);
  });

  it('una relación que deja de ser M:N pierde su tabla intermedia', () => {
    const d = manyToManyDiagram();
    const res = applyOperations(d.nodes, d.connections, [
      {
        op: 'update_relation',
        source: 'Alumno',
        target: 'Curso',
        sourceMultiplicity: '*',
        targetMultiplicity: '1',
      },
    ]);
    expect(res.nodes.map((n) => n.name).sort()).toEqual([
      'Alumno',
      'Curso',
      'Profesor',
    ]);
    expect(
      res.connections.find((c) => c.id === 'ac')?.assocAnchorNodeId,
    ).toBeUndefined();
  });

  it('cruza las multiplicidades si la relación existente va en sentido contrario', () => {
    const res = applyOperations(
      [node('p', 'Pedido'), node('c', 'Cliente')],
      [conn('r', 'p', 'c', '*', '1')],
      [
        {
          op: 'update_relation',
          source: 'Cliente',
          target: 'Pedido',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        },
      ],
    );
    expect(res.connections[0]).toMatchObject({
      sourceNodeId: 'p',
      sourceMultiplicity: '1..*',
      targetMultiplicity: '1',
    });
  });

  it('add_relation entre clases ya relacionadas actualiza la relación en vez de duplicarla', () => {
    const res = applyOperations(
      [node('p', 'Pedido'), node('c', 'Cliente')],
      [conn('r', 'p', 'c')],
      [
        {
          op: 'add_relation',
          source: 'Pedido',
          target: 'Cliente',
          type: 'composition',
        },
      ],
    );
    expect(res.connections).toHaveLength(1);
    expect(res.connections[0].type).toBe('composition');
  });

  it('una relación M:N nueva genera su tabla intermedia al resolverla', () => {
    const res = applyOperations(
      [node('a', 'Alumno', ['id']), node('c', 'Curso', ['id'])],
      [],
      [
        {
          op: 'add_relation',
          source: 'Alumno',
          target: 'Curso',
          sourceMultiplicity: '*',
          targetMultiplicity: '*',
        },
      ],
    );
    const resolved = resolveManyToManyRelationships(res.nodes, res.connections);
    const assoc = resolved.nodes.find((n) => n.assocMainConnId);
    expect(assoc?.attributes.map((a) => a.name)).toEqual([
      'alumnoId',
      'cursoId',
    ]);
    expect(resolved.nodes.some((n) => n.isAnchor)).toBe(true);
  });

  it('registra las operaciones sobre clases inexistentes sin romper el resto', () => {
    const res = applyOperations(
      [node('a', 'Alumno')],
      [],
      [
        { op: 'remove_class', target: 'Fantasma' },
        { op: 'add_relation', source: 'Alumno', target: 'Fantasma' },
        { op: 'update_class', target: 'Alumno', rename: 'Estudiante' },
      ],
    );
    expect(res.nodes[0].name).toBe('Estudiante');
    expect(res.skipped).toHaveLength(2);
  });

  it('clear_diagram vacía el diagrama', () => {
    const res = applyOperations(
      [node('a', 'Alumno')],
      [],
      [{ op: 'clear_diagram' }],
    );
    expect(res.nodes).toEqual([]);
  });

  it('no modifica el diagrama de entrada', () => {
    const current = [node('a', 'Alumno', ['id'])];
    applyOperations(
      current,
      [],
      [{ op: 'update_class', target: 'Alumno', clearAttributes: true }],
    );
    expect(current[0].attributes).toHaveLength(1);
  });
});

describe('dropUnrequestedOperations', () => {
  const invented: DiagramOperation[] = [
    { op: 'add_class', name: 'Usuario' },
    { op: 'add_class', name: 'Usuario_Products' },
    {
      op: 'add_relation',
      source: 'Usuario',
      target: 'Products',
      sourceMultiplicity: '*',
      targetMultiplicity: '*',
    },
  ];

  it('descarta clases y relaciones que el usuario no pidió al crear una clase concreta', () => {
    const ops = dropUnrequestedOperations(
      invented,
      'agrega una tabla usuario con id, name y email',
    );
    expect(ops).toEqual([{ op: 'add_class', name: 'Usuario' }]);
  });

  it('respeta las relaciones cuando el usuario las pide', () => {
    const ops = dropUnrequestedOperations(
      invented,
      'agrega una tabla usuario y relaciónala muchos a muchos con Products',
    );
    expect(ops).toHaveLength(3);
  });
});
