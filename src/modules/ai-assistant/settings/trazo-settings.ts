/**
 * Cómo trabaja Trazo en un proyecto («Configurar Trazo»). Trazo nunca actúa por su cuenta:
 * estos ajustes solo cambian cómo responde cuando alguien le habla.
 */

/** apply: aplica los cambios pedidos; propose: siempre los deja como propuesta; explain: solo explica. */
export type TrazoDelivery = 'apply' | 'propose' | 'explain';
/** brief: breve y directo; mentor: explica el porqué y hace preguntas. */
export type TrazoStyle = 'brief' | 'mentor';
/** Temperatura del modelo. */
export type TrazoCreativity = 'precise' | 'balanced' | 'creative';

export const TRAZO_DELIVERIES: TrazoDelivery[] = [
  'apply',
  'propose',
  'explain',
];
export const TRAZO_STYLES: TrazoStyle[] = ['brief', 'mentor'];
export const TRAZO_CREATIVITIES: TrazoCreativity[] = [
  'precise',
  'balanced',
  'creative',
];

export interface TrazoSettingsValues {
  delivery: TrazoDelivery;
  style: TrazoStyle;
  creativity: TrazoCreativity;
  /** Modelo del servidor; sin valor, el predeterminado. */
  model?: string;
}

export const DEFAULT_TRAZO_SETTINGS: TrazoSettingsValues = {
  delivery: 'apply',
  style: 'mentor',
  creativity: 'balanced',
};

/** Las respuestas son JSON con operaciones: incluso «creativo» se queda por debajo de 1. */
export const CREATIVITY_TEMPERATURE: Record<TrazoCreativity, number> = {
  precise: 0.05,
  balanced: 0.2,
  creative: 0.6,
};

const DELIVERY_LABEL: Record<TrazoDelivery, string> = {
  apply: 'aplico los cambios que me piden',
  propose:
    'dejo los cambios como propuesta y alguien del equipo pulsa «Aplicar»',
  explain: 'solo explico cómo hacerlo, sin tocar el diagrama',
};
const STYLE_LABEL: Record<TrazoStyle, string> = {
  brief: 'respondo breve y directo',
  mentor: 'explico el porqué y hago preguntas, como mentor',
};
const CREATIVITY_LABEL: Record<TrazoCreativity, string> = {
  precise: 'creatividad baja (respuestas más predecibles)',
  balanced: 'creatividad equilibrada',
  creative: 'creatividad alta (más ideas)',
};

/** Qué cambió, en frases para el aviso del canal («ahora propongo…; respondo breve…»). */
export function describeSettingsChange(
  before: TrazoSettingsValues,
  after: TrazoSettingsValues,
  defaultModel: string,
): string[] {
  const changes: string[] = [];
  if (before.delivery !== after.delivery)
    changes.push(DELIVERY_LABEL[after.delivery]);
  if (before.style !== after.style) changes.push(STYLE_LABEL[after.style]);
  if (before.creativity !== after.creativity)
    changes.push(CREATIVITY_LABEL[after.creativity]);
  const beforeModel = before.model || defaultModel;
  const afterModel = after.model || defaultModel;
  if (beforeModel !== afterModel) changes.push(`uso el modelo ${afterModel}`);
  return changes;
}

/** Reglas para el prompt de cada turno según la configuración del proyecto. */
export function settingsRules(settings: TrazoSettingsValues): string {
  const delivery: Record<TrazoDelivery, string> = {
    apply:
      'Cuando una persona que puede editar pide un cambio, usa "edit": se aplica al momento.',
    propose:
      'El equipo quiere revisar antes de cambiar nada: NUNCA uses "edit". Cuando pidan un cambio, usa "propose" con sus operaciones y explica qué harás; alguien del equipo pulsará «Aplicar».',
    explain:
      'Modo didáctico: NO cambies ni propongas cambios ("operations": [] siempre; usa "answer"). Si piden un cambio, explica paso a paso cómo hacerlo ellos en el editor y por qué es la decisión correcta.',
  };
  const style: Record<TrazoStyle, string> = {
    brief:
      'Responde en 1 a 3 frases (máximo unas 50 palabras), directo al grano. No expliques teoría salvo que la pidan.',
    mentor:
      'Responde en unas 120 palabras: explica el porqué con un ejemplo del propio diagrama y, cuando ayude a pensar, termina con una pregunta corta para el equipo.',
  };
  return `CÓMO TRABAJAS EN ESTE PROYECTO (lo configuró el equipo):
- ${delivery[settings.delivery]}
- ${style[settings.style]}`;
}
