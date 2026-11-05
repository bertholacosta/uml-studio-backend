import { normalizeForFuzzy } from './node-matching';

/** Diagrama del proyecto y los nombres de sus clases. */
export interface DiagramRef {
  id: string;
  name: string;
  classNames: string[];
}

/**
 * Por qué se eligió el lienzo: tag (#Ventas en el mensaje), open (lo tiene abierto quien
 * escribe), classes (solo ese diagrama tiene las clases que menciona), thread (el último con
 * el que trabajó Trazo en la conversación) u only (el proyecto tiene un único diagrama).
 */
export type TargetReason = 'tag' | 'open' | 'classes' | 'thread' | 'only';

export interface DiagramTarget {
  diagram: DiagramRef;
  reason: TargetReason;
}

const TAG = /#([\p{L}\d_-]+)/gu;
const MIN_CLASS_NAME = 3;

/** Etiqueta con la que se menciona un diagrama en el chat: «Diagrama de ventas» → «#Diagrama-de-ventas». */
export function diagramTag(name: string): string {
  return `#${name.trim().replace(/\s+/g, '-')}`;
}

/**
 * Decide sobre qué diagrama trabaja Trazo: primero el que se marca con #, después el que tiene
 * abierto quien escribe, el único que contiene las clases mencionadas, el último del hilo o el
 * único del proyecto. Si nada lo deja claro devuelve null y Trazo pregunta.
 */
export function resolveDiagramTarget(
  text: string,
  diagrams: DiagramRef[],
  hints: { activeDiagramId?: string; threadDiagramId?: string } = {},
): DiagramTarget | null {
  for (const [, token] of text.matchAll(TAG)) {
    const wanted = normalizeForFuzzy(token);
    const tagged = diagrams.find((d) => normalizeForFuzzy(d.name) === wanted);
    if (tagged) return { diagram: tagged, reason: 'tag' };
  }

  const open = diagrams.find((d) => d.id === hints.activeDiagramId);
  if (open) return { diagram: open, reason: 'open' };

  const normText = normalizeForFuzzy(text);
  const withMentionedClasses = diagrams.filter((d) =>
    d.classNames.some((className) => {
      const normName = normalizeForFuzzy(className);
      return normName.length >= MIN_CLASS_NAME && normText.includes(normName);
    }),
  );
  if (withMentionedClasses.length === 1) {
    return { diagram: withMentionedClasses[0], reason: 'classes' };
  }

  const thread = diagrams.find((d) => d.id === hints.threadDiagramId);
  if (thread) return { diagram: thread, reason: 'thread' };

  if (diagrams.length === 1) return { diagram: diagrams[0], reason: 'only' };
  return null;
}
