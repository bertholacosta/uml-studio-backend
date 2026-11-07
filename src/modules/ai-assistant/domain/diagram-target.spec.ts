import { diagramTag, resolveDiagramTarget } from './diagram-target';

describe('resolveDiagramTarget', () => {
  const diagrams = [
    { id: 'd1', name: 'Ventas', classNames: ['Cliente', 'Pedido'] },
    { id: 'd2', name: 'Control de inventario', classNames: ['Producto'] },
  ];

  it('prioriza el diagrama marcado con #, aunque se tenga otro abierto', () => {
    expect(
      resolveDiagramTarget('agrega Lote en #Control-de-inventario', diagrams, {
        activeDiagramId: 'd1',
      }),
    ).toMatchObject({ diagram: { id: 'd2' }, reason: 'tag' });
  });

  it('para revisar el trabajo de alguien usa el lienzo donde trabajó, salvo que se marque otro', () => {
    expect(
      resolveDiagramTarget('revisa lo que hizo Marco', diagrams, {
        activeDiagramId: 'd1',
        activityDiagramId: 'd2',
      }),
    ).toMatchObject({ diagram: { id: 'd2' }, reason: 'activity' });
    expect(
      resolveDiagramTarget('revisa lo que hizo Marco en #Ventas', diagrams, {
        activityDiagramId: 'd2',
      }),
    ).toMatchObject({ diagram: { id: 'd1' }, reason: 'tag' });
  });

  it('usa el diagrama abierto si no se marca ninguno', () => {
    expect(
      resolveDiagramTarget('agrega Producto', diagrams, {
        activeDiagramId: 'd1',
      }),
    ).toMatchObject({ diagram: { id: 'd1' }, reason: 'open' });
  });

  it('desde el móvil, deduce el diagrama por las clases que se mencionan', () => {
    expect(
      resolveDiagramTarget('agrega stock a los productos', diagrams),
    ).toMatchObject({ diagram: { id: 'd2' }, reason: 'classes' });
  });

  it('sigue el hilo si las clases no lo aclaran', () => {
    expect(
      resolveDiagramTarget('ahora conéctala con la anterior', diagrams, {
        threadDiagramId: 'd1',
      }),
    ).toMatchObject({ diagram: { id: 'd1' }, reason: 'thread' });
  });

  it('devuelve null si no hay pistas y hay varios diagramas', () => {
    expect(resolveDiagramTarget('agrega una clase Pago', diagrams)).toBeNull();
  });

  it('con un único diagrama, trabaja en él', () => {
    expect(
      resolveDiagramTarget('agrega una clase Pago', [diagrams[0]]),
    ).toMatchObject({ diagram: { id: 'd1' }, reason: 'only' });
  });

  it('genera la etiqueta con guiones en lugar de espacios', () => {
    expect(diagramTag('Control de inventario')).toBe('#Control-de-inventario');
  });
});
