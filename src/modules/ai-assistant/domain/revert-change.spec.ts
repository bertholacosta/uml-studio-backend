import { revertChange } from './revert-change';
import { UmlClassNode, UmlConnection } from './uml-diagram.types';

const node = (
  id: string,
  name: string,
  attributes: [string, string][] = [['id', 'UUID']],
  x = 0,
): UmlClassNode => ({
  id,
  name,
  position: { x, y: 0 },
  attributes: attributes.map(([n, type]) => ({ name: n, type })),
  methods: [],
});
const relation = (
  id: string,
  source: string,
  target: string,
  type = 'association',
): UmlConnection => ({
  id,
  sourceId: `${source}_right`,
  targetId: `${target}_left`,
  type,
});

describe('revertChange', () => {
  const lote = node('n1', 'Lote', [
    ['id', 'UUID'],
    ['codigoProveedor', 'String'],
    ['precio', 'Double'],
  ]);
  const proveedor = node('n2', 'Proveedor');
  const viejo = node('n3', 'Viejo');
  const before = {
    nodes: [lote, proveedor, viejo],
    connections: [relation('c1', 'n1', 'n2'), relation('c2', 'n3', 'n2')],
  };
  // Trazo: quita codigoProveedor, cambia precio a BigDecimal, crea Pago con su relación,
  // elimina Viejo (y su relación) y convierte c1 en composición
  const after = {
    nodes: [
      node('n1', 'Lote', [
        ['id', 'UUID'],
        ['precio', 'BigDecimal'],
      ]),
      proveedor,
      node('n9', 'Pago'),
    ],
    connections: [
      relation('c1', 'n1', 'n2', 'composition'),
      relation('c9', 'n9', 'n1'),
    ],
  };

  it('sin otros cambios, deja el diagrama como estaba', () => {
    const reverted = revertChange(after, before, after);
    expect(reverted.nodes.map((n) => n.name)).toEqual([
      'Lote',
      'Proveedor',
      'Viejo',
    ]);
    expect(reverted.nodes[0].attributes).toEqual(lote.attributes);
    expect(reverted.connections).toEqual(before.connections);
  });

  it('conserva lo que el equipo cambió después en lo que Trazo no tocó', () => {
    const current = {
      nodes: [
        // Ana movió Lote y le agregó un atributo después del cambio de Trazo
        {
          ...node(
            'n1',
            'Lote',
            [
              ['id', 'UUID'],
              ['precio', 'BigDecimal'],
              ['stock', 'Integer'],
            ],
            300,
          ),
        },
        node('n2', 'Proveedor', [
          ['id', 'UUID'],
          ['ruc', 'String'],
        ]),
        node('n9', 'Pago'),
        node('n10', 'Almacen'),
      ],
      connections: [
        relation('c1', 'n1', 'n2', 'composition'),
        relation('c9', 'n9', 'n1'),
        relation('c10', 'n10', 'n1'),
      ],
    };
    const reverted = revertChange(current, before, after);

    expect(reverted.nodes.map((n) => n.name)).toEqual([
      'Lote',
      'Proveedor',
      'Almacen',
      'Viejo',
    ]);
    expect(reverted.nodes[0].position.x).toBe(300);
    expect(
      reverted.nodes[0].attributes.map((a) => `${a.name}:${a.type}`),
    ).toEqual([
      'id:UUID',
      'codigoProveedor:String',
      'precio:Double',
      'stock:Integer',
    ]);
    expect(reverted.nodes[1].attributes.map((a) => a.name)).toEqual([
      'id',
      'ruc',
    ]);
    expect(reverted.connections.map((c) => `${c.id}:${c.type}`)).toEqual([
      'c1:association',
      'c10:association',
      'c2:association',
    ]);
  });

  it('no deja relaciones sueltas hacia clases que ya no existen', () => {
    const current = {
      nodes: after.nodes,
      connections: [...after.connections, relation('c11', 'n9', 'n2')],
    };
    const reverted = revertChange(current, before, after);
    expect(reverted.connections.map((c) => c.id)).not.toContain('c11');
  });
});
