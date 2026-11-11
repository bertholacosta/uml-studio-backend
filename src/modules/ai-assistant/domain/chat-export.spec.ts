import { ExportConversation, buildChatExport } from './chat-export';

const ana = { userId: 'u1', userName: 'Ana Pérez' };
const trazo = { userId: 'trazo', userName: 'Trazo' };

const conversations = (): ExportConversation[] => [
  {
    id: 'c1',
    startedBy: ana,
    createdAt: new Date('2026-11-10T14:00:00Z'),
    active: false,
    messages: [
      {
        id: 'm1',
        role: 'user',
        author: ana,
        text: '@Trazo crea la clase Cliente',
        createdAt: new Date('2026-11-10T14:00:00Z'),
        image: 'data:image/png;base64,AAAA',
      },
      {
        id: 'm2',
        role: 'assistant',
        author: trazo,
        text: 'Ana, creé la clase Cliente.',
        createdAt: new Date('2026-11-10T14:00:05Z'),
        model: 'deepseek-flash',
        latencyMs: 3100,
        diagramName: 'Ventas',
        changesSummary: '1 clase creada',
        review: { state: 'accepted', by: ana },
      },
    ],
  },
  {
    id: 'c2',
    startedBy: ana,
    createdAt: new Date('2026-11-11T12:00:00Z'),
    active: true,
    messages: [
      {
        id: 'm3',
        role: 'user',
        author: ana,
        text: 'Gracias',
        createdAt: new Date('2026-11-11T12:00:00Z'),
        quote: { authorName: 'Trazo', text: 'Ana, creé la clase Cliente.' },
      },
    ],
  },
];

const now = new Date('2026-11-11T18:00:00Z');

describe('buildChatExport', () => {
  it('Markdown: todas las conversaciones, en la zona horaria de quien exporta', () => {
    const file = buildChatExport({
      projectName: 'Tienda Créditos',
      channel: 'team',
      conversations: conversations(),
      format: 'md',
      timeZone: 'America/La_Paz',
      now,
    });

    expect(file.filename).toBe('trazo-tienda-creditos-equipo-2026-11-11.md');
    expect(file.mimeType).toBe('text/markdown');
    const md = file.content;
    expect(md).toContain('# Chat de Trazo — Tienda Créditos');
    expect(md).toContain('2 conversaciones, 3 mensajes');
    expect(md).toContain('## Conversación 1 — iniciada por Ana Pérez');
    expect(md).toContain('(archivada)');
    expect(md).toContain('(actual)');
    // 14:00 UTC son las 10:00 en La Paz
    expect(md).toMatch(/\*\*Ana Pérez\*\* · 10\/11\/26,? 10:00/);
    expect(md).toContain('deepseek-flash · 3.1 s · diagrama «Ventas»');
    expect(md).toContain('_[imagen adjunta]_');
    expect(md).toContain(
      '_Cambios: 1 clase creada · Cambio aceptado por Ana Pérez_',
    );
    expect(md).toContain(
      '> En respuesta a Trazo: «Ana, creé la clase Cliente.»',
    );
    expect(md).not.toContain('base64');
  });

  it('JSON: datos completos sin incrustar imágenes', () => {
    const file = buildChatExport({
      projectName: 'Tienda',
      channel: 'direct',
      conversations: conversations(),
      format: 'json',
      now,
    });

    expect(file.filename).toBe('trazo-tienda-privado-2026-11-11.json');
    const data = JSON.parse(file.content);
    expect(data).toMatchObject({ project: 'Tienda', channel: 'direct' });
    expect(data.conversations).toHaveLength(2);
    expect(data.conversations[0].messages[0]).toMatchObject({
      id: 'm1',
      hasImage: true,
    });
    expect(data.conversations[0].messages[0].image).toBeUndefined();
  });

  it('una zona horaria inválida usa UTC y un canal vacío lo dice', () => {
    const file = buildChatExport({
      projectName: 'Vacío',
      channel: 'team',
      conversations: [],
      format: 'md',
      timeZone: 'Marte/Olympus',
      now,
    });
    expect(file.content).toContain('(UTC)');
    expect(file.content).toContain('Todavía no hay mensajes');
  });
});
