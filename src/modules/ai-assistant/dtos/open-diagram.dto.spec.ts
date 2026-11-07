import { ValidationPipe } from '@nestjs/common';
import { ReviewChangeDto, SendChatMessageDto } from './ai-chat.dto';

/** La misma validación global que main.ts (con conversión implícita de tipos). */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

describe('diagrama abierto en los DTO del chat', () => {
  const node = {
    id: 'n1',
    name: 'Lote',
    position: { x: 1, y: 2 },
    attributes: [{ name: 'id', type: 'UUID' }],
    methods: [],
  };

  it('las clases y relaciones llegan como objetos, no como arreglos', async () => {
    const dto: ReviewChangeDto = await pipe.transform(
      {
        decision: 'revert',
        currentNodes: [node],
        currentConnections: [{ id: 'c1', sourceId: 'a', targetId: 'b' }],
      },
      { type: 'body', metatype: ReviewChangeDto },
    );
    expect(Array.isArray(dto.currentNodes![0])).toBe(false);
    // Se pueden guardar o copiar tal cual (antes JSON.stringify daba [])
    expect(JSON.parse(JSON.stringify(dto.currentNodes))).toEqual([node]);
    expect(JSON.stringify(dto.currentConnections)).toContain('"c1"');
  });

  it('lo mismo al enviar un mensaje con el diagrama abierto', async () => {
    const dto: SendChatMessageDto = await pipe.transform(
      { channel: 'team', text: 'hola', currentNodes: [node] },
      { type: 'body', metatype: SendChatMessageDto },
    );
    expect(JSON.parse(JSON.stringify(dto.currentNodes))).toEqual([node]);
  });
});
