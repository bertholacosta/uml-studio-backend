import { reviseProposal } from './revise-proposal';
import { DiagramOperation } from './diagram-operations';

describe('reviseProposal', () => {
  const original = [
    {
      op: 'add_class',
      name: 'Pago',
      attributes: [
        { name: 'id', type: 'UUID' },
        { name: 'monto', type: 'BigDecimal' },
      ],
      methods: [],
    },
    {
      op: 'add_relation',
      source: 'Pago',
      target: 'Lote',
      type: 'association',
      sourceMultiplicity: '*',
      targetMultiplicity: '1',
    },
  ];

  it('integra un update_class en la clase que crea la propuesta', () => {
    const revised = reviseProposal(original, [
      {
        op: 'update_class',
        target: 'Pago',
        updateAttributes: [{ name: 'monto', type: 'Double' }],
        addAttributes: [{ name: 'fecha', type: 'LocalDate' }],
      },
    ]);
    expect(revised).toEqual([
      {
        op: 'add_class',
        name: 'Pago',
        attributes: [
          { name: 'id', type: 'UUID' },
          { name: 'monto', type: 'Double' },
          { name: 'fecha', type: 'LocalDate' },
        ],
        methods: [],
      },
      original[1],
    ]);
  });

  it('si el modelo devuelve la propuesta completa, la usa tal cual', () => {
    const complete: DiagramOperation[] = [
      {
        op: 'add_class',
        name: 'Pago',
        attributes: [{ name: 'id', type: 'UUID' }],
      },
    ];
    expect(reviseProposal(original, complete)).toBe(complete);
  });

  it('renombrar la clase propuesta arrastra sus relaciones', () => {
    const revised = reviseProposal(original, [
      { op: 'update_class', target: 'Pago', rename: 'Cobro' },
    ]) as any[];
    expect(revised[0].name).toBe('Cobro');
    expect(revised[1].source).toBe('Cobro');
  });

  it('cambia o quita una relación de la propuesta y añade lo que es nuevo', () => {
    const revised = reviseProposal(original, [
      {
        op: 'update_relation',
        source: 'Lote',
        target: 'Pago',
        type: 'composition',
      },
      {
        op: 'add_class',
        name: 'Recibo',
        attributes: [{ name: 'id', type: 'UUID' }],
      },
    ]) as any[];
    expect(revised[1].type).toBe('composition');
    expect(revised.map((o) => o.name || o.op)).toEqual([
      'Pago',
      'add_relation',
      'Recibo',
    ]);
    expect(
      reviseProposal(original, [
        { op: 'remove_relation', source: 'Pago', target: 'Lote' },
      ]),
    ).toHaveLength(1);
  });

  it('quitar la clase propuesta quita también sus relaciones', () => {
    expect(
      reviseProposal(original, [{ op: 'remove_class', target: 'Pago' }]),
    ).toEqual([]);
  });
});
