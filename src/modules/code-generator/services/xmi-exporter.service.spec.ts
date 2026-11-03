import { Test, TestingModule } from '@nestjs/testing';
import { XmiExporterService, DiagramAstData } from './xmi-exporter.service';

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
});
