import { readStreamDraft } from './stream-draft';

describe('readStreamDraft', () => {
  const full = JSON.stringify({
    reply: 'Ana, creé "Pago" con\nid y monto.',
    intent: 'edit',
    changesSummary: 'Clase Pago',
    operations: [
      {
        op: 'add_class',
        name: 'Pago',
        attributes: [{ name: 'id', type: 'UUID' }],
      },
      { op: 'add_relation', source: 'Pago', target: 'Pedido' },
    ],
  });

  it('lee el texto de la respuesta a medida que llega, con escapes', () => {
    const cut = full.indexOf('con');
    expect(readStreamDraft(full.slice(0, cut))).toEqual({
      reply: 'Ana, creé "Pago" ',
      replyDone: false,
      inOperations: false,
      operations: [],
    });
    expect(readStreamDraft(full)).toMatchObject({
      reply: 'Ana, creé "Pago" con\nid y monto.',
      replyDone: true,
    });
  });

  it('no rompe con un escape o un \\u cortados', () => {
    expect(readStreamDraft('{"reply": "Hola\\').reply).toBe('Hola');
    expect(readStreamDraft('{"reply": "Hola \\u00e').reply).toBe('Hola ');
    expect(readStreamDraft('{"reply": "Hola \\u00e1"').reply).toBe('Hola á');
  });

  it('devuelve las operaciones ya completas mientras se escriben las demás', () => {
    const second = full.indexOf('{"op":"add_relation"');
    const partial = readStreamDraft(full.slice(0, second + 20));
    expect(partial.inOperations).toBe(true);
    expect(partial.operations).toEqual([
      {
        op: 'add_class',
        name: 'Pago',
        attributes: [{ name: 'id', type: 'UUID' }],
      },
    ]);
    expect(readStreamDraft(full).operations).toHaveLength(2);
  });

  it('sin "reply" todavía, el borrador está vacío', () => {
    expect(readStreamDraft('{"re')).toEqual({
      reply: '',
      replyDone: false,
      inOperations: false,
      operations: [],
    });
  });
});
