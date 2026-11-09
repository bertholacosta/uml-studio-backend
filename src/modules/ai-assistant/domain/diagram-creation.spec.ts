import {
  DEFAULT_DIAGRAM_NAME,
  diagramCreationRequest,
  uniqueDiagramName,
} from './diagram-creation';

describe('diagramCreationRequest', () => {
  it.each([
    [
      '@Trazo crea un nuevo diagrama para un sistema e-commerce',
      'Sistema e-commerce',
    ],
    ['créame un diagrama de clases para una biblioteca', 'Biblioteca'],
    ['necesito un diagrama de ventas', 'Ventas'],
    ['quiero que crees un lienzo sobre inventario', 'Inventario'],
    ['nuevo diagrama de reservas', 'Reservas'],
    ['diseña un diagrama UML de una clínica', 'Clínica'],
  ])('«%s» pide crear y diseñar %s', (text, name) => {
    expect(diagramCreationRequest(text)).toMatchObject({ name, design: true });
  });

  it('crea vacío si no dice de qué trata', () => {
    expect(diagramCreationRequest('@Trazo crea un diagrama nuevo')).toEqual({
      name: DEFAULT_DIAGRAM_NAME,
      design: false,
      definite: false,
    });
  });

  it.each([
    ['crea otro diagrama llamado Pagos', 'Pagos'],
    ['haz un diagrama "Control de stock"', 'Control de stock'],
    ['crea un diagrama #Facturas', 'Facturas'],
  ])('«%s» solo da nombre', (text, name) => {
    expect(diagramCreationRequest(text)).toMatchObject({ name, design: false });
  });

  it('separa el nombre del contenido', () => {
    expect(
      diagramCreationRequest('crea un diagrama de ventas con Cliente y Pedido'),
    ).toMatchObject({ name: 'Ventas', design: true });
    expect(
      diagramCreationRequest(
        'crea un diagrama llamado Pagos con Tarjeta y Banco',
      ),
    ).toMatchObject({ name: 'Pagos', design: true });
  });

  it('marca el artículo definido', () => {
    expect(diagramCreationRequest('arma el diagrama de ventas')).toMatchObject({
      name: 'Ventas',
      definite: true,
    });
  });

  it.each([
    '¿cómo creo un diagrama nuevo?',
    'explícame cómo crear un diagrama',
    'no crees un diagrama todavía',
    'crea la clase Cliente en el diagrama',
    'agrega Pedido al diagrama de ventas',
    'revisa el diagrama',
    '¿qué le falta a este diagrama?',
  ])('«%s» no pide un diagrama nuevo', (text) => {
    expect(diagramCreationRequest(text)).toBeNull();
  });
});

describe('uniqueDiagramName', () => {
  it('conserva un nombre libre', () => {
    expect(uniqueDiagramName('Ventas', ['Pagos'])).toBe('Ventas');
  });

  it('numera los repetidos sin distinguir mayúsculas ni acentos', () => {
    expect(uniqueDiagramName('Gestión', ['gestion', 'Gestion 2'])).toBe(
      'Gestión 3',
    );
  });
});
