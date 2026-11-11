import { withFreshIds } from './diagram-sanitizer';
import { UmlClassNode, UmlConnection } from './uml-diagram.types';

const node = (id: string, extra: Partial<UmlClassNode> = {}): UmlClassNode => ({
  id,
  name: id,
  position: { x: 0, y: 0 },
  attributes: [],
  methods: [],
  ...extra,
});

const link = (
  id: string,
  source: string,
  target: string,
  extra: Partial<UmlConnection> = {},
): UmlConnection => ({
  id,
  sourceNodeId: source,
  targetNodeId: target,
  sourceId: `${source}_right`,
  targetId: `${target}_left`,
  type: 'association',
  ...extra,
});

describe('withFreshIds', () => {
  it('da ids nuevos a lo que no existe y actualiza puertos y referencias', () => {
    const { nodes, connections } = withFreshIds(
      [node('node_Cliente'), node('node_Venta')],
      [link('conn_1', 'node_Cliente', 'node_Venta')],
      { nodes: [], connections: [] },
    );

    const [cliente, venta] = nodes;
    expect(cliente.id).toMatch(/^node_[0-9a-f-]{36}$/);
    expect(cliente.id).not.toBe('node_Cliente');
    expect(connections[0]).toMatchObject({
      sourceNodeId: cliente.id,
      targetNodeId: venta.id,
      sourceId: `${cliente.id}_right`,
      targetId: `${venta.id}_left`,
    });
    expect(connections[0].id).toMatch(/^conn_[0-9a-f-]{36}$/);
  });

  it('dos digitalizaciones de la misma imagen no repiten ids', () => {
    const run = () =>
      withFreshIds([node('node_Cliente')], [], { nodes: [], connections: [] })
        .nodes[0].id;
    expect(run()).not.toBe(run());
  });

  it('conserva los ids de lo que ya está en el diagrama', () => {
    const existing = {
      nodes: [node('node_ya')],
      connections: [link('conn_ya', 'node_ya', 'node_ya')],
    };
    const { nodes, connections } = withFreshIds(
      [node('node_ya'), node('node_Nuevo')],
      [
        link('conn_ya', 'node_ya', 'node_ya'),
        link('conn_2', 'node_ya', 'node_Nuevo'),
      ],
      existing,
    );

    expect(nodes[0].id).toBe('node_ya');
    expect(nodes[1].id).not.toBe('node_Nuevo');
    expect(connections[0]).toMatchObject({
      id: 'conn_ya',
      sourceId: 'node_ya_right',
    });
    expect(connections[1]).toMatchObject({
      sourceNodeId: 'node_ya',
      targetNodeId: nodes[1].id,
      targetId: `${nodes[1].id}_left`,
    });
  });

  it('actualiza las anclas de las clases de asociación', () => {
    const { nodes, connections } = withFreshIds(
      [
        node('node_A'),
        node('node_B'),
        node('anchor_AB', { isAnchor: true, assocMainConnId: 'conn_AB' }),
      ],
      [link('conn_AB', 'node_A', 'node_B', { assocAnchorNodeId: 'anchor_AB' })],
      { nodes: [], connections: [] },
    );

    const anchor = nodes[2];
    expect(anchor.assocMainConnId).toBe(connections[0].id);
    expect(connections[0].assocAnchorNodeId).toBe(anchor.id);
  });
});
