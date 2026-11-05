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
      submitMessage: jest.fn(),
      submitVisionDiagram: jest.fn(),
      getConversation: jest.fn(),
      startConversation: jest.fn(),
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

  it('POST /chat/projects/:id/messages: un mensaje entre personas queda enviado', async () => {
    const dto = { channel: 'team' as const, text: 'Luis, ¿lo revisas?' };
    const message = { id: 'm-1' } as any;
    service.submitMessage.mockResolvedValue({ message });

    await expect(controller.sendMessage('p-1', dto, user)).resolves.toEqual({
      status: 'sent',
      message,
    });
    expect(service.submitMessage).toHaveBeenCalledWith('p-1', dto, user);
  });

  it('POST /chat/projects/:id/messages: con @Trazo queda en cola sin esperar la respuesta', async () => {
    const dto = { channel: 'team' as const, text: '@Trazo revisa Pedido' };
    const message = { id: 'm-2' } as any;
    // La respuesta del modelo nunca llega: el controlador no debe esperarla
    service.submitMessage.mockResolvedValue({
      message,
      result: new Promise(() => undefined),
    });

    await expect(controller.sendMessage('p-1', dto, user)).resolves.toEqual({
      status: 'queued',
      message,
    });
  });

  it('POST /ai/vision-diagram acepta la imagen y responde por el socket', async () => {
    const dto = {
      imageBase64: 'base64str',
      mimeType: 'image/png',
      diagramId: 'd-1',
    };
    const message = { id: 'm-3' } as any;
    service.submitVisionDiagram.mockResolvedValue({
      message,
      result: new Promise(() => undefined),
    });

    await expect(controller.processVisionDiagram(dto, user)).resolves.toEqual({
      status: 'queued',
      message,
    });
    expect(service.submitVisionDiagram).toHaveBeenCalledWith(dto, user);
  });

  it('GET /chat/projects/:id/:channel devuelve la conversación', async () => {
    const conversation = { id: 'c-1', channel: 'direct' } as any;
    service.getConversation.mockResolvedValue(conversation);

    await expect(
      controller.getConversation('p-1', 'direct', { limit: 20 }, user),
    ).resolves.toBe(conversation);
    expect(service.getConversation).toHaveBeenCalledWith(
      'p-1',
      'direct',
      user,
      20,
    );
  });

  it('POST /chat/messages/:id/apply delega en applyProposal', async () => {
    const dto = { currentNodes: [], currentConnections: [] };
    await controller.applyProposal('m-1', dto, user);
    expect(service.applyProposal).toHaveBeenCalledWith('m-1', dto, user);
  });
});
