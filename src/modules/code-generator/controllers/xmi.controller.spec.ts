import { Test, TestingModule } from '@nestjs/testing';
import { XmiController } from './xmi.controller';
import { XmiInteropService } from '../services/xmi-interop.service';

describe('XmiController', () => {
  let controller: XmiController;
  let service: jest.Mocked<XmiInteropService>;

  beforeEach(async () => {
    const mockService = {
      exportDiagramToXmi: jest.fn().mockResolvedValue({
        filename: 'diagram_ea.xmi',
        xmiContent: '<xmi:XMI></xmi:XMI>',
      }),
      importXmi: jest.fn().mockResolvedValue({
        name: 'Imported',
        nodes: [],
        connections: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [XmiController],
      providers: [{ provide: XmiInteropService, useValue: mockService }],
    }).compile();

    controller = module.get<XmiController>(XmiController);
    service = module.get(XmiInteropService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should export diagram to XMI', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.exportDiagram(
      '11111111-1111-1111-1111-111111111111',
      { id: 'user-1' } as any,
      mockRes,
    );
    expect(service.exportDiagramToXmi).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'user-1',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/xml',
    );
    expect(mockRes.send).toHaveBeenCalledWith('<xmi:XMI></xmi:XMI>');
  });

  it('should import XMI content', async () => {
    const res = await controller.importXmi(
      { xmiContent: '<xmi:XMI></xmi:XMI>' },
      { id: 'user-1', email: 'test@example.com', role: 'EDITOR' },
    );
    expect(res.name).toBe('Imported');
    expect(service.importXmi).toHaveBeenCalled();
  });
});
