import { Test, TestingModule } from '@nestjs/testing';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from '../services/ai-assistant.service';
import { User } from '../../auth/entities/user.entity';

describe('AiAssistantController', () => {
  let controller: AiAssistantController;
  let service: jest.Mocked<AiAssistantService>;
  const user = { id: 'user-1', fullName: 'Ana Pérez' } as User;

  beforeEach(async () => {
    const mockService = {
      submitTextPrompt: jest.fn(),
      submitVisionDiagram: jest.fn(),
      getConversation: jest.fn(),
      applyProposal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiAssistantController],
      providers: [{ provide: AiAssistantService, useValue: mockService }],
    }).compile();

    controller = module.get<AiAssistantController>(AiAssistantController);
    service = module.get(AiAssistantService);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('POST /prompt acepta el mensaje al instante sin esperar a Trazo', async () => {
    const dto = { prompt: 'Crea tabla Pago', diagramId: 'd-1' };
    const userMessage = { id: 'm-1', text: 'Crea tabla Pago' } as any;
    // La respuesta del modelo nunca llega: el controlador no debe esperarla
    service.submitTextPrompt.mockResolvedValue({
      userMessage,
      result: new Promise(() => undefined),
    });

    await expect(controller.processPrompt(dto, user)).resolves.toEqual({
      status: 'queued',
      userMessage,
    });
    expect(service.submitTextPrompt).toHaveBeenCalledWith(dto, user);
  });

  it('POST /vision-diagram acepta la imagen y responde por el socket', async () => {
    const dto = {
      imageBase64: 'base64str',
      mimeType: 'image/png',
      diagramId: 'd-1',
    };
    const userMessage = { id: 'm-2' } as any;
    service.submitVisionDiagram.mockResolvedValue({
      userMessage,
      result: new Promise(() => undefined),
    });

    await expect(controller.processVisionDiagram(dto, user)).resolves.toEqual({
      status: 'queued',
      userMessage,
    });
    expect(service.submitVisionDiagram).toHaveBeenCalledWith(dto, user);
  });

  it('GET /diagrams/:id/conversation devuelve la conversación compartida', async () => {
    const conversation = {
      id: 'c-1',
      diagramId: 'd-1',
      startedBy: { userId: 'user-1', userName: 'Ana Pérez' },
      createdAt: new Date(),
      messages: [],
      hasMore: false,
    };
    service.getConversation.mockResolvedValue(conversation);

    await expect(
      controller.getConversation('d-1', { limit: 20 }, user),
    ).resolves.toBe(conversation);
    expect(service.getConversation).toHaveBeenCalledWith('d-1', user, 20);
  });

  it('POST /messages/:id/apply delega en applyProposal', async () => {
    const dto = { currentNodes: [], currentConnections: [] };
    await controller.applyProposal('m-1', dto, user);
    expect(service.applyProposal).toHaveBeenCalledWith('m-1', dto, user);
  });
});
