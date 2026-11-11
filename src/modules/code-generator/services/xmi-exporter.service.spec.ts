import { Test, TestingModule } from '@nestjs/testing';
import { XmiExporterService, DiagramAstData } from './xmi-exporter.service';
import { XmiParserService } from './xmi-parser.service';

describe('XmiExporterService', () => {
  let service: XmiExporterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XmiExporterService],
    }).compile();

    service = module.get<XmiExporterService>(XmiExporterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should export a UML diagram to complete XMI 2.1 with Enterprise Architect diagrams section', () => {
    const mockDiagram: DiagramAstData = {
      name: 'SistemaVentas',
      nodes: [
        {
          id: 'node_user',
          name: 'Usuario',
          position: { x: 100, y: 150 },
          width: 220,
          height: 140,
          attributes: [
            { name: 'id', type: 'UUID', visibility: 'private', isPk: true },
            { name: 'email', type: 'String', visibility: 'private' },
          ],
          methods: [
            {
              name: 'getEmail',
              returnType: 'String',
              visibility: 'public',
              parameters: '',
            },
          ],
        },
        {
          id: 'node_order',
          name: 'Pedido',
          position: { x: 450, y: 150 },
          width: 220,
          height: 140,
          attributes: [
            { name: 'id', type: 'UUID', visibility: 'private', isPk: true },
            { name: 'total', type: 'Double', visibility: 'private' },
          ],
          methods: [],
        },
      ],
      connections: [
        {
          id: 'conn_1',
          sourceNodeId: 'node_user',
          targetNodeId: 'node_order',
          type: 'composition',
          name: 'realiza',
          sourceMultiplicity: '1',
          targetMultiplicity: '0..*',
        },
      ],
    };

    const xml = service.exportToXmi(mockDiagram);

    expect(xml).toContain('<?xml version="1.0" encoding="windows-1252"?>');
    expect(xml).toContain(
      '<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1"',
    );
    expect(xml).toContain('<xmi:Documentation exporter="Enterprise Architect"');
    expect(xml).toContain('<uml:Model xmi:type="uml:Model"');
    expect(xml).toContain('<packagedElement xmi:type="uml:Class"');
    expect(xml).toContain('name="Usuario"');
    expect(xml).toContain('name="Pedido"');
    expect(xml).toContain('name="id"');
    expect(xml).toContain('name="total"');
    expect(xml).toContain('<packagedElement xmi:type="uml:Association"');
    expect(xml).toContain('<xmi:Extension extender="Enterprise Architect"');
    expect(xml).toContain('<connectors>');
    expect(xml).toContain('<connector');
    expect(xml).toContain('<diagrams>');
    expect(xml).toContain('<diagram');
    expect(xml).toContain('Left=100;Top=150;Right=320;Bottom=290;');
    expect(xml).toContain('Left=450;Top=150;Right=670;Bottom=290;');
  });

  it('exporta visibilidad, roles y navegabilidad, y el parser los recupera', () => {
    const diagram: DiagramAstData = {
      name: 'Empresa',
      nodes: [
        {
          id: 'node_emp',
          name: 'Empleado',
          position: { x: 100, y: 100 },
          attributes: [
            { name: 'id', type: 'UUID', visibility: 'private' },
            { name: 'nombre', type: 'String', visibility: 'protected' },
          ],
          methods: [
            { name: 'ascender', returnType: 'void', visibility: 'package' },
          ],
        },
        {
          id: 'node_dep',
          name: 'Departamento',
          position: { x: 500, y: 100 },
          attributes: [{ name: 'id', type: 'UUID', visibility: 'private' }],
          methods: [],
        },
      ],
      connections: [
        {
          id: 'conn_trabaja',
          sourceNodeId: 'node_emp',
          targetNodeId: 'node_dep',
          type: 'association',
          sourceMultiplicity: '*',
          targetMultiplicity: '1',
          sourceRole: 'personal',
          targetRole: 'area',
          navigability: 'to_target',
        },
        {
          id: 'conn_supervisa',
          sourceNodeId: 'node_emp',
          targetNodeId: 'node_emp',
          type: 'association',
          name: 'supervisa',
          sourceMultiplicity: '0..1',
          targetMultiplicity: '*',
          sourceRole: 'jefe',
          targetRole: 'subordinados',
          navigability: 'both',
        },
      ],
    };

    const xml = service.exportToXmi(diagram);

    expect(xml).toContain('name="nombre" visibility="protected"');
    expect(xml).toContain('name="ascender" visibility="package"');
    expect(xml).toContain('<role name="area" visibility="Public"');
    expect(xml).toContain('direction="Source -&gt; Destination"');
    expect(xml).toContain('direction="Bi-Directional"');
    expect(xml.match(/<navigableOwnedEnd /g)).toHaveLength(3);

    const parsed = new XmiParserService().parseXmi(xml);
    const empleado = parsed.nodes.find((n) => n.name === 'Empleado')!;
    const departamento = parsed.nodes.find((n) => n.name === 'Departamento')!;
    expect(empleado.attributes?.map((a) => a.visibility)).toEqual([
      'private',
      'protected',
    ]);
    expect(empleado.methods?.[0].visibility).toBe('package');

    const trabaja = parsed.connections.find(
      (c) => c.targetNodeId === departamento.id,
    )!;
    expect(trabaja).toMatchObject({
      sourceNodeId: empleado.id,
      sourceRole: 'personal',
      targetRole: 'area',
      navigability: 'to_target',
    });
    const supervisa = parsed.connections.find(
      (c) => c.sourceNodeId === empleado.id && c.targetNodeId === empleado.id,
    )!;
    expect(supervisa).toMatchObject({
      name: 'supervisa',
      sourceMultiplicity: '0..1',
      // El XMI guarda «*» con sus dos límites
      targetMultiplicity: '0..*',
      sourceRole: 'jefe',
      targetRole: 'subordinados',
      navigability: 'both',
    });
  });
});
