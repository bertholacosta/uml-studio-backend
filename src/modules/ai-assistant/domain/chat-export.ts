import type { ChatChannel } from '../conversation/ai-conversation.schema';

/**
 * Exportación del historial de un canal de chat (todas sus conversaciones, también las
 * archivadas) a Markdown legible o a JSON completo. Las imágenes no se incrustan: solo se
 * indica que había una, para que el archivo no pese megas.
 */

export type ChatExportFormat = 'md' | 'json';

export interface ExportAuthor {
  userId: string;
  userName: string;
}

export interface ExportMessage {
  id: string;
  role: 'user' | 'assistant';
  author: ExportAuthor;
  text: string;
  createdAt: Date;
  status?: string;
  intent?: string;
  diagramName?: string;
  changesSummary?: string;
  model?: string;
  latencyMs?: number;
  quote?: { authorName: string; text: string };
  image?: string;
  proposal?: { state: string; appliedBy?: ExportAuthor };
  review?: { state: string; by?: ExportAuthor };
}

export interface ExportConversation {
  id: string;
  startedBy: ExportAuthor;
  createdAt: Date;
  active: boolean;
  messages: ExportMessage[];
}

export interface ChatExportInput {
  projectName: string;
  channel: ChatChannel;
  conversations: ExportConversation[];
  format: ChatExportFormat;
  /** Zona horaria de quien exporta (p. ej. America/La_Paz); si no es válida, UTC. */
  timeZone?: string;
  now?: Date;
}

export interface ChatExportFile {
  filename: string;
  mimeType: string;
  content: string;
}

const CHANNEL_LABEL: Record<ChatChannel, string> = {
  team: 'canal del equipo',
  direct: 'conversación privada con Trazo',
};

const REVIEW_LABEL: Record<string, string> = {
  pending: 'pendiente de revisión',
  accepted: 'aceptado',
  reverted: 'deshecho',
};

const PROPOSAL_LABEL: Record<string, string> = {
  pending: 'propuesta pendiente',
  applied: 'propuesta aplicada',
  replaced: 'propuesta reemplazada',
};

/** Zona horaria válida para Intl o, si no, UTC. */
function safeTimeZone(timeZone?: string): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('es', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'proyecto';

export function buildChatExport(input: ChatExportInput): ChatExportFile {
  const timeZone = safeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now); // AAAA-MM-DD
  const base = `trazo-${slug(input.projectName)}-${input.channel === 'team' ? 'equipo' : 'privado'}-${day}`;

  if (input.format === 'json') {
    return {
      filename: `${base}.json`,
      mimeType: 'application/json',
      content: JSON.stringify(
        {
          project: input.projectName,
          channel: input.channel,
          exportedAt: now.toISOString(),
          conversations: input.conversations.map((c) => ({
            id: c.id,
            startedBy: c.startedBy,
            createdAt: c.createdAt,
            active: c.active,
            messages: c.messages.map(({ image, ...m }) => ({
              ...m,
              hasImage: !!image,
            })),
          })),
        },
        null,
        2,
      ),
    };
  }

  return {
    filename: `${base}.md`,
    mimeType: 'text/markdown',
    content: toMarkdown(input, timeZone, now),
  };
}

function toMarkdown(
  input: ChatExportInput,
  timeZone: string,
  now: Date,
): string {
  const date = new Intl.DateTimeFormat('es', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const total = input.conversations.reduce((n, c) => n + c.messages.length, 0);
  const lines: string[] = [
    `# Chat de Trazo — ${input.projectName}`,
    '',
    `${capitalize(CHANNEL_LABEL[input.channel])}. Exportado el ${date.format(now)} (${timeZone}).`,
    `${input.conversations.length} ${input.conversations.length === 1 ? 'conversación' : 'conversaciones'}, ${total} ${total === 1 ? 'mensaje' : 'mensajes'}.`,
  ];

  if (!input.conversations.length || !total) {
    lines.push('', '_Todavía no hay mensajes en este canal._');
    return lines.join('\n') + '\n';
  }

  input.conversations
    .filter((c) => c.messages.length)
    .forEach((conversation, index) => {
      lines.push(
        '',
        `## Conversación ${index + 1} — iniciada por ${conversation.startedBy.userName} el ${date.format(conversation.createdAt)}${conversation.active ? ' (actual)' : ' (archivada)'}`,
      );
      for (const m of conversation.messages) {
        const meta = [date.format(m.createdAt)];
        if (m.role === 'assistant') {
          if (m.model) meta.push(m.model);
          if (m.latencyMs) meta.push(`${(m.latencyMs / 1000).toFixed(1)} s`);
        }
        if (m.diagramName) meta.push(`diagrama «${m.diagramName}»`);
        lines.push('', `**${m.author.userName}** · ${meta.join(' · ')}`);
        if (m.quote) {
          lines.push(
            `> En respuesta a ${m.quote.authorName}: «${oneLine(m.quote.text)}»`,
            '',
          );
        }
        if (m.image) lines.push('_[imagen adjunta]_', '');
        lines.push(m.status === 'error' ? `_(error)_ ${m.text}` : m.text);
        const notes: string[] = [];
        if (m.changesSummary) notes.push(`Cambios: ${m.changesSummary}`);
        if (m.proposal) {
          notes.push(
            `${capitalize(PROPOSAL_LABEL[m.proposal.state] || m.proposal.state)}${m.proposal.appliedBy ? ` por ${m.proposal.appliedBy.userName}` : ''}`,
          );
        }
        if (m.review) {
          notes.push(
            `Cambio ${REVIEW_LABEL[m.review.state] || m.review.state}${m.review.by ? ` por ${m.review.by.userName}` : ''}`,
          );
        }
        if (notes.length) lines.push('', `_${notes.join(' · ')}_`);
      }
    });
  return lines.join('\n') + '\n';
}

const oneLine = (text: string) => {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
};

const capitalize = (text: string) =>
  text ? text[0].toUpperCase() + text.slice(1) : text;
