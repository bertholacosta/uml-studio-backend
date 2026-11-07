import { operationSteps } from './operation-steps';

describe('operationSteps', () => {
  it('describe cada operación como un paso para hacerlo a mano', () => {
    expect(
      operationSteps([
        {
          op: 'add_class',
          name: 'Pago',
          attributes: [
            { name: 'id', type: 'UUID' },
            { name: 'monto', type: 'BigDecimal' },
          ],
        },
        {
          op: 'update_class',
          target: 'Lote',
          removeAttributes: ['codigoProveedor'],
          updateAttributes: [{ name: 'precio', type: 'BigDecimal' }],
        },
        {
          op: 'add_relation',
          source: 'Pago',
          target: 'Pedido',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '1',
          name: 'paga',
        },
        { op: 'remove_relation', source: 'Lote', target: 'Almacen' },
        { op: 'remove_class', target: 'Viejo' },
      ]),
    ).toEqual([
      'crea la clase Pago con id: UUID, monto: BigDecimal',
      'en Lote, quita codigoProveedor, cambia precio (BigDecimal)',
      'relaciona Pago (*) con Pedido (1) con una asociación «paga»',
      'quita la relación entre Lote y Almacen',
      'elimina la clase Viejo',
    ]);
  });

  it('omite una actualización sin cambios', () => {
    expect(operationSteps([{ op: 'update_class', target: 'Lote' }])).toEqual(
      [],
    );
  });
});
