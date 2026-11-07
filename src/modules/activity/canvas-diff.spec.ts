import {
  changesSince,
  DiffConnection,
  DiffNode,
  describeChanges,
  diffFacts,
  factsOf,
  mergeChanges,
} from './canvas-diff';

const cliente: DiffNode = {
  id: 'n1',
  name: 'Cliente',
  attributes: [{ name: 'id', type: 'UUID' }],
  methods: [],
};
const pedido: DiffNode = {
  id: 'n2',
  name: 'Pedido',
  attributes: [{ name: 'id', type: 'UUID' }],
  methods: [],
};
const realiza: DiffConnection = {
  id: 'c1',
  sourceNodeId: 'n2',
  targetNodeId: 'n1',
  type: 'association',
  sourceMultiplicity: '*',
  targetMultiplicity: '1',
  name: 'realiza',
};

const diff = (
  before: [DiffNode[], DiffConnection[]],
  after: [DiffNode[], DiffConnection[]],
) => diffFacts(factsOf(...before), factsOf(...after));

describe('canvas-diff', () => {
  it('describe una clase nueva con sus atributos y su relación', () => {
    const changes = diff([[cliente], []], [[cliente, pedido], [realiza]]);
    expect(describeChanges(changes)).toBe(
      'creó la clase Pedido (id: UUID); relacionó Pedido * —asociación— 1 Cliente «realiza»',
    );
  });

  it('agrupa por clase los atributos y métodos de clases que ya existían', () => {
    const changes = diff(
      [[cliente], []],
      [
        [
          {
            ...cliente,
            attributes: [
              { name: 'id', type: 'Long' },
              { name: 'email', type: 'String' },
            ],
            methods: [{ name: 'activar', parameters: '', returnType: 'void' }],
          },
        ],
        [],
      ],
    );
    expect(describeChanges(changes)).toBe(
      'en Cliente: id: UUID → Long, +email: String, +activar(): void',
    );
  });

  it('mover una clase no es un cambio y renombrarla no cambia sus relaciones', () => {
    expect(diff([[cliente], []], [[{ ...cliente }], []])).toEqual([]);
    const changes = diff(
      [[cliente, pedido], [realiza]],
      [[{ ...cliente, name: 'Comprador' }, pedido], [realiza]],
    );
    expect(describeChanges(changes)).toBe('renombró Cliente → Comprador');
  });

  it('acepta las relaciones del editor que solo traen el conector', () => {
    const fromSocket: DiffConnection = {
      id: 'c1',
      sourceId: 'n2_right',
      targetId: 'n1_left',
      type: 'composition',
    };
    const changes = diff(
      [[cliente, pedido], []],
      [[cliente, pedido], [fromSocket]],
    );
    expect(describeChanges(changes)).toBe(
      'relacionó Pedido —composición— Cliente',
    );
  });

  it('ignora las anclas de las clases de asociación', () => {
    const anchor: DiffNode = { id: 'a1', isAnchor: true, name: '' };
    const link: DiffConnection = {
      id: 'c9',
      sourceNodeId: 'a1',
      targetNodeId: 'n1',
      type: 'dependency',
    };
    expect(diff([[cliente], []], [[cliente, anchor], [link]])).toEqual([]);
  });

  it('al ponerse al día cuenta solo lo posterior a la fecha', () => {
    const before = diff([[], []], [[pedido], []]).map((c) => ({
      ...c,
      at: 1000,
    }));
    const after = diff(
      [[pedido], []],
      [
        [
          {
            ...pedido,
            attributes: [
              ...pedido.attributes!,
              { name: 'fecha', type: 'LocalDate' },
            ],
          },
        ],
        [],
      ],
    ).map((c) => ({ ...c, at: 5000 }));
    const merged = mergeChanges(before, after);
    expect(describeChanges(merged)).toBe(
      'creó la clase Pedido (id: UUID, fecha: LocalDate)',
    );
    expect(describeChanges(changesSince(merged, new Date(3000)))).toBe(
      'en Pedido: +fecha: LocalDate',
    );
  });

  describe('mergeChanges', () => {
    const empty: [DiffNode[], DiffConnection[]] = [[], []];

    it('crear y después borrar se anula', () => {
      const created = diff(empty, [[pedido], []]);
      const removed = diff([[pedido], []], empty);
      expect(mergeChanges(created, removed)).toEqual([]);
    });

    it('cambiar dos veces deja un cambio del valor original al último', () => {
      const v1 = { ...cliente, attributes: [{ name: 'id', type: 'UUID' }] };
      const v2 = { ...cliente, attributes: [{ name: 'id', type: 'Long' }] };
      const v3 = { ...cliente, attributes: [{ name: 'id', type: 'String' }] };
      const merged = mergeChanges(
        diff([[v1], []], [[v2], []]),
        diff([[v2], []], [[v3], []]),
      );
      expect(describeChanges(merged)).toBe('en Cliente: id: UUID → String');
      // Y si vuelve al original, no queda nada
      expect(mergeChanges(merged, diff([[v3], []], [[v1], []]))).toEqual([]);
    });

    it('lo nuevo sigue siendo nuevo aunque se edite después', () => {
      const created = diff(empty, [[pedido], []]);
      const edited = diff([[pedido], []], [[{ ...pedido, name: 'Orden' }], []]);
      expect(describeChanges(mergeChanges(created, edited))).toBe(
        'creó la clase Orden (id: UUID)',
      );
    });

    it('recibir dos veces el mismo cambio no lo duplica', () => {
      const created = diff(empty, [[pedido], []]);
      expect(mergeChanges(created, created)).toEqual(created);
    });
  });
});
