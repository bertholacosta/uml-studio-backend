import { reviewFindings } from './model-review';
import { UmlClassNode, UmlConnection } from './uml-diagram.types';

const node = (
  id: string,
  name: string,
  attributes: [string, string][],
): UmlClassNode => ({
  id,
  name,
  position: { x: 0, y: 0 },
  attributes: attributes.map(([n, type]) => ({ name: n, type })),
  methods: [],
});

describe('reviewFindings', () => {
  const lote = node('n1', 'Lote', [
    ['id', 'UUID'],
    ['codigoProveedor', 'String'],
  ]);
  const proveedor = node('n2', 'Proveedor', [['id', 'UUID']]);
  const provee: UmlConnection = {
    id: 'c1',
    sourceId: 'n1_right',
    targetId: 'n2_left',
    type: 'association',
  };

  it('detecta un atributo que repite una relación', () => {
    expect(reviewFindings([lote, proveedor], [provee])).toEqual([
      expect.stringContaining(
        'Lote.codigoProveedor repite la relación con Proveedor',
      ),
    ]);
  });

  it('sin la relación, el atributo no es redundante', () => {
    expect(reviewFindings([lote, proveedor], [])).toEqual([]);
  });

  it('señala clases sin id y dinero en Double', () => {
    const pago = node('n3', 'Pago', [['monto', 'Double']]);
    expect(reviewFindings([pago], [])).toEqual([
      'Pago no tiene atributo id.',
      'Pago.monto es dinero en Double: mejor BigDecimal.',
    ]);
  });

  it('no confunde atributos que solo contienen el nombre de otra clase', () => {
    const cliente = node('n4', 'Cliente', [
      ['id', 'UUID'],
      ['tipoCliente', 'String'],
    ]);
    const pedido = node('n5', 'Pedido', [['id', 'UUID']]);
    const rel: UmlConnection = {
      id: 'c2',
      sourceNodeId: 'n5',
      targetNodeId: 'n4',
      sourceId: 'n5_left',
      targetId: 'n4_right',
      type: 'association',
    };
    expect(reviewFindings([cliente, pedido], [rel])).toEqual([]);
  });
});
