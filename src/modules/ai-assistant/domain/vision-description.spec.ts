import {
  VisionDescription,
  applyDashedLineAnswers,
  dashedLineQuestions,
  diagramFromDescription,
  isVisionDescription,
} from './vision-description';

/** El boceto de prueba: DetalleVenta cuelga con línea discontinua de Credito–Producto. */
const sketch = (): VisionDescription => ({
  classes: [
    {
      name: 'Cliente',
      attributes: [{ name: 'IDCliente' }, { name: 'nombre' }],
    },
    { name: 'Credito', attributes: [{ name: 'IDCredito' }, { name: 'fecha' }] },
    { name: 'Producto', attributes: [{ name: 'IDProducto' }] },
    {
      name: 'DetalleVenta',
      attributes: [{ name: 'IDdetalle' }, { name: 'fecha' }],
    },
  ],
  relations: [
    {
      from: 'Cliente',
      to: 'Credito',
      fromMultiplicity: '1',
      toMultiplicity: '*',
      style: 'solid',
    },
    {
      from: 'Credito',
      to: 'Producto',
      fromMultiplicity: '*',
      toMultiplicity: 'x',
      style: 'solid',
    },
    // El modelo ve el trazo discontinuo pero lo pega a Credito en vez de al medio de la línea
    {
      from: 'Credito',
      to: 'DetalleVenta',
      fromMultiplicity: '',
      toMultiplicity: '',
      style: 'dashed',
    },
  ],
});

describe('descripción de visión', () => {
  it('reconoce la forma de descripción frente al AST de la app', () => {
    expect(isVisionDescription(sketch())).toBe(true);
    expect(isVisionDescription({ nodes: [] })).toBe(false);
  });

  it('pregunta por cada línea discontinua con las líneas continuas de sus cajas', () => {
    const [question, ...rest] = dashedLineQuestions(sketch());
    expect(rest).toHaveLength(0);
    expect([...question.lines.keys()]).toEqual([
      'Cliente-Credito',
      'Credito-Producto',
    ]);
    expect((question.schema as any).properties.associationClass.enum).toEqual([
      'Credito',
      'DetalleVenta',
    ]);
  });

  it('convierte la respuesta en clase de asociación con ancla y «link»', () => {
    const desc = sketch();
    const [question] = dashedLineQuestions(desc);
    const resolved = applyDashedLineAnswers(desc, [
      {
        question,
        answer: {
          associationClass: 'DetalleVenta',
          touchesLine: 'Credito-Producto',
        },
      },
    ]);
    const { nodes, connections } = diagramFromDescription(resolved);

    const byName = (name: string) => nodes.find((n) => n.name === name)!;
    const detalle = byName('DetalleVenta');
    const anchor = nodes.find((n) => n.isAnchor)!;
    const main = connections.find((c) => c.assocAnchorNodeId)!;

    // Sin conexiones directas de la clase de asociación a Credito o Producto
    expect(
      connections.filter(
        (c) =>
          c.type !== 'association_class' &&
          [c.sourceNodeId, c.targetNodeId].includes(detalle.id),
      ),
    ).toHaveLength(0);
    expect(main).toMatchObject({
      sourceNodeId: byName('Credito').id,
      targetNodeId: byName('Producto').id,
      sourceMultiplicity: '*',
      targetMultiplicity: '*', // la «x» dibujada es muchos
      assocAnchorNodeId: anchor.id,
    });
    expect(detalle.assocMainConnId).toBe(main.id);
    expect(connections).toContainEqual(
      expect.objectContaining({
        type: 'association_class',
        sourceNodeId: anchor.id,
        targetNodeId: detalle.id,
      }),
    );
    // Conserva sus atributos dibujados (no se reduce a dos claves foráneas)
    expect(detalle.attributes).toEqual([
      { name: 'iddetalle', type: 'UUID' },
      { name: 'fecha', type: 'LocalDateTime' },
    ]);
  });

  it('una línea discontinua que no llega a ninguna línea queda como dependencia', () => {
    const desc = sketch();
    const [question] = dashedLineQuestions(desc);
    const resolved = applyDashedLineAnswers(desc, [
      {
        question,
        answer: { associationClass: 'DetalleVenta', touchesLine: 'ninguna' },
      },
    ]);
    const { connections } = diagramFromDescription(resolved);
    expect(connections.filter((c) => c.type === 'dependency')).toHaveLength(1);
    expect(connections.some((c) => c.assocAnchorNodeId)).toBe(false);
  });

  it('da tipos por nombre y normaliza el prefijo ID', () => {
    const { nodes } = diagramFromDescription({
      classes: [
        {
          name: 'Cliente',
          attributes: [
            { name: 'IDCliente' },
            { name: 'fechaAlta' },
            { name: 'saldo', type: 'Double' },
          ],
        },
      ],
    });
    expect(nodes[0].attributes).toEqual([
      { name: 'idCliente', type: 'UUID' },
      { name: 'fechaAlta', type: 'LocalDateTime' },
      { name: 'saldo', type: 'Double' },
    ]);
  });
});
