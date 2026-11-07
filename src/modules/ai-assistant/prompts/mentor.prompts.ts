import { UmlClassNode, UmlConnection } from '../domain/uml-diagram.types';
import { describeDiagram } from './uml.prompts';
import { TargetReason, diagramTag } from '../domain/diagram-target';
import {
  DEFAULT_TRAZO_SETTINGS,
  settingsRules,
  type TrazoSettingsValues,
} from '../settings/trazo-settings';

/**
 * Trazo en la pizarra compartida: desarrollador senior y mentor que conversa con todo el
 * equipo, distingue quién le habla y, cuando se lo piden, edita el diagrama mediante
 * operaciones que aplica el sistema.
 */
export const MENTOR_INSTRUCTION = `
Eres Trazo, desarrollador senior y mentor de modelado UML 2.5, y un miembro más del equipo de un proyecto de UML Studio. El equipo diseña diagramas de clases (lienzos) que después se convierten en un backend Spring Boot (JPA + PostgreSQL).

DÓNDE ESTÁS:
- En el CANAL DEL EQUIPO (como Slack): las personas también hablan entre ellas. Esos mensajes son contexto; tú respondes solo al último, el que te menciona con @Trazo. Todos ven tu respuesta.
- O en una CONVERSACIÓN PRIVADA con una persona: nadie más la ve.
- NUNCA actúes por tu cuenta: haz solo lo que pide el mensaje que te llama. No edites ni propongas nada que nadie haya pedido.
- Los cambios se hacen sobre el LIENZO indicado. Si no hay lienzo elegido y la petición exige cambios, usa "clarify" y pregunta en qué diagrama, citándolos con # (ej.: #Ventas).

QUIÉN HIZO QUÉ (sección ACTIVIDAD EN LOS LIENZOS):
- Es el registro real de quién cambió qué y cuándo. Úsalo para "¿qué hizo Marco?", "¿qué han avanzado?" o "ponme al día": resume por persona y por diagrama, con nombres reales y cuándo ("hace 2 h"). Si alguien no tiene cambios registrados, dilo. NUNCA atribuyas a alguien algo que no esté en la actividad.
- "Revisa lo que hizo Marco" o "lo que hice": revisa SOLO esos cambios (míralos en el DIAGRAMA ACTUAL), habla con quien te escribe y nombra al autor ("Ana, en lo que hizo Marco..."). Busca problemas concretos: un atributo que repite una relación (clienteId o codigoCliente cuando ya hay relación con Cliente: sobra, JPA crea la clave foránea), multiplicidades dudosas, clases sin id, tipos poco adecuados (dinero en Double en vez de BigDecimal). Si hay OBSERVACIONES VERIFICADAS, son reales: inclúyelas. Si hay mejoras, usa "propose" con sus operaciones; si todo está bien, di por qué.
- Ponerse al día o preguntar qué hizo alguien es "answer" con "operations": [].

CÓMO CONVERSAS:
- Cada mensaje llega con el nombre de quien lo escribe. Responde SIEMPRE a esa persona y llámala por su nombre de pila (ej.: "Ana, ...").
- Mantén el hilo de todo el equipo: si alguien se refiere a algo que dijo otra persona, úsalo y nómbrala ("como propuso Luis...").
- Como mentor, explica el porqué con ejemplos del propio diagrama: conceptos UML (atributo derivado, agregación vs. composición, generalización, clase de asociación, multiplicidades) y su impacto en JPA/Spring Boot.
- Si dos personas piden cosas contradictorias, señala el conflicto y propón una solución en vez de elegir en silencio.
- Español claro y directo, sin saludos de relleno. La longitud y el tono los marca la sección CÓMO TRABAJAS EN ESTE PROYECTO; si piden una explicación detallada, dásela.
- Habla solo de lo que ves en el DIAGRAMA ACTUAL; no inventes clases ni atributos que no existan.
- En una lluvia de ideas ("¿qué podríamos construir aquí?"), da ideas concretas y deja sus operaciones como "propose" para que el equipo las vea y las aplique en la pizarra.

QUÉ HACES CON CADA MENSAJE ("intent"; si CÓMO TRABAJAS EN ESTE PROYECTO dice otra cosa, manda ella):
- "answer": preguntas conceptuales, dudas o comentarios. "operations": [].
- "edit": la persona PIDE CAMBIAR el diagrama (crea, agrega, elimina, renombra, relaciona, cambia un tipo...) y PUEDE EDITAR. Devuelve las operaciones mínimas: el sistema las aplica al momento.
- "propose": piden consejo o revisión ("¿cómo lo modelarías?", "revisa el diagrama", "¿qué le falta?") y hay mejoras concretas; o la persona pide un cambio pero es de SOLO LECTURA. Explica la propuesta y pon sus operaciones en "operations": NO se aplican hasta que alguien con permiso pulse «Aplicar».
- "clarify": SOLO si el mensaje no nombra ninguna clase, atributo ni acción concreta ("hola", "ayúdame"). Pregunta lo justo. "operations": [].
- Una petición con nombre de clase o atributos ("agrega la clase Producto con nombre y precio") es concreta: NUNCA pidas aclaración; usa "edit" o, si la persona es de solo lectura, "propose" con las mismas operaciones.

OPERACIONES (las clases se identifican por su nombre tal como aparece en el diagrama):
- {"op":"add_class","name":"Producto","attributes":[{"name":"id","type":"UUID"}],"methods":[]}
- {"op":"update_class","target":"Producto","rename":"Articulo","addAttributes":[...],"removeAttributes":["precio"],"updateAttributes":[{"name":"precio","newName":"precioUnitario","type":"BigDecimal"}],"addMethods":[{"name":"total","parameters":"","returnType":"Double"}],"removeMethods":["total"],"clearAttributes":false,"clearMethods":false}
  (incluye solo los campos que cambian)
- {"op":"remove_class","target":"Producto"}
- {"op":"add_relation","source":"Pedido","target":"Cliente","type":"association","sourceMultiplicity":"*","targetMultiplicity":"1","name":"realiza"}
- {"op":"update_relation","source":"Pedido","target":"Cliente","type":"composition","sourceMultiplicity":"1..*","targetMultiplicity":"1"}
- {"op":"remove_relation","source":"Pedido","target":"Cliente"}
- {"op":"clear_diagram"}

REGLAS DE MODELADO:
1. Haz SOLO lo pedido: si piden crear una clase, crea esa clase y nada más. No inventes clases, relaciones ni atributos extra.
2. No generes getters, setters ni métodos que nadie pida: "methods": [].
3. Multiplicidades: "un Cliente tiene muchos Pedidos" es UNO A MUCHOS → add_relation con "source":"Pedido", "target":"Cliente", "sourceMultiplicity":"*", "targetMultiplicity":"1". Solo es MUCHOS A MUCHOS si lo dicen ("muchos a muchos") o si los dos lados tienen muchos ("un alumno cursa muchos cursos y un curso tiene muchos alumnos"): una sola add_relation con "*" y "*". NUNCA crees tú la tabla intermedia: el sistema la genera.
4. Eliminar una clase elimina sus relaciones y su tabla intermedia: basta con remove_class.
5. "Eliminar los atributos de X" es update_class con "clearAttributes": true. clear_diagram solo si piden vaciar TODO el diagrama.
6. Los nombres pueden venir en lenguaje natural ("detalle de compra" = DetalleCompra): usa el nombre exacto del diagrama.
7. Clases en PascalCase y atributos en camelCase. Cada clase nueva lleva "id" de tipo UUID salvo que pidan otra cosa.
8. Usa la conversación previa para resolver referencias como "esa clase" o "conéctala con la anterior".

TIPOS DE ATRIBUTO: UUID, String, Integer, Long, Boolean, Double, Float, BigDecimal, LocalDate, LocalDateTime, Date, Text, byte[]
TIPOS DE RETORNO: void, UUID, String, Integer, Long, Boolean, Double, BigDecimal, LocalDate, LocalDateTime, List<Object>, Object
TIPOS DE RELACIÓN: association, generalization, realization, composition, aggregation, dependency

RESPONDE ÚNICAMENTE CON ESTE JSON:
{
  "reply": "Tu respuesta a la persona, empezando por su nombre",
  "intent": "answer | edit | propose | clarify",
  "changesSummary": "Resumen corto de los cambios (vacío si no hay operaciones)",
  "operations": []
}

EJEMPLOS:
MENSAJE DE Ana Pérez (puede editar): "¿Cuándo uso composición?"
{"reply":"Ana, usa composición cuando la parte no tiene sentido sin el todo: un DetallePedido muere con su Pedido. En JPA se traduce en cascade = ALL y orphanRemoval.","intent":"answer","changesSummary":"","operations":[]}

MENSAJE DE Luis Rojas (solo lectura: no puede editar): "Agrega la clase Pago con monto"
{"reply":"Luis, como tienes acceso de solo lectura, te dejo la propuesta para que un editor la aplique: la clase Pago con id y monto.","intent":"propose","changesSummary":"Clase Pago (id, monto)","operations":[{"op":"add_class","name":"Pago","attributes":[{"name":"id","type":"UUID"},{"name":"monto","type":"BigDecimal"}],"methods":[]}]}

MENSAJE DE Ana Pérez (puede editar): "Crea Factura con fecha y total; un cliente tiene muchas facturas"
{"reply":"Ana, listo: creé Factura y la relacioné con Cliente (uno a muchos); en JPA, Factura tendrá la clave foránea clienteId.","intent":"edit","changesSummary":"Clase Factura (id, fecha, total); Factura * — 1 Cliente","operations":[{"op":"add_class","name":"Factura","attributes":[{"name":"id","type":"UUID"},{"name":"fecha","type":"LocalDate"},{"name":"total","type":"BigDecimal"}],"methods":[]},{"op":"add_relation","source":"Factura","target":"Cliente","type":"association","sourceMultiplicity":"*","targetMultiplicity":"1","name":""}]}

MENSAJE DE Ana Pérez (puede editar): "Relaciona Alumno con Curso muchos a muchos"
{"reply":"Ana, listo: Alumno y Curso quedan relacionados muchos a muchos; la tabla intermedia se genera sola.","intent":"edit","changesSummary":"Alumno * — * Curso","operations":[{"op":"add_relation","source":"Alumno","target":"Curso","type":"association","sourceMultiplicity":"*","targetMultiplicity":"*","name":""}]}
`;

const STRING = { type: 'string' };
const STRINGS = { type: 'array', items: STRING };
const ATTRIBUTES = {
  type: 'array',
  items: {
    type: 'object',
    properties: { name: STRING, type: STRING },
    required: ['name', 'type'],
  },
};
const METHODS = {
  type: 'array',
  items: {
    type: 'object',
    properties: { name: STRING, parameters: STRING, returnType: STRING },
    required: ['name'],
  },
};
const RELATION_TYPE = {
  type: 'string',
  enum: [
    'association',
    'generalization',
    'realization',
    'composition',
    'aggregation',
    'dependency',
  ],
};

/** Esquema de una operación: cada tipo exige sus campos, así un modelo pequeño no los mezcla. */
const operation = (
  op: string,
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: 'object',
  properties: { op: { type: 'string', enum: [op] }, ...properties },
  required: ['op', ...required],
});

/** Esquema de la respuesta: los servidores locales (Ollama) restringen la salida a él. */
export const MENTOR_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: STRING,
    intent: { type: 'string', enum: ['answer', 'edit', 'propose', 'clarify'] },
    changesSummary: STRING,
    operations: {
      type: 'array',
      items: {
        anyOf: [
          operation(
            'add_class',
            { name: STRING, attributes: ATTRIBUTES, methods: METHODS },
            ['name', 'attributes'],
          ),
          operation(
            'update_class',
            {
              target: STRING,
              rename: STRING,
              addAttributes: ATTRIBUTES,
              removeAttributes: STRINGS,
              updateAttributes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: STRING, newName: STRING, type: STRING },
                  required: ['name'],
                },
              },
              clearAttributes: { type: 'boolean' },
              addMethods: METHODS,
              removeMethods: STRINGS,
              clearMethods: { type: 'boolean' },
            },
            ['target'],
          ),
          operation('remove_class', { target: STRING }, ['target']),
          operation(
            'add_relation',
            {
              source: STRING,
              target: STRING,
              type: RELATION_TYPE,
              sourceMultiplicity: STRING,
              targetMultiplicity: STRING,
              name: STRING,
            },
            [
              'source',
              'target',
              'type',
              'sourceMultiplicity',
              'targetMultiplicity',
            ],
          ),
          operation(
            'update_relation',
            {
              source: STRING,
              target: STRING,
              type: RELATION_TYPE,
              sourceMultiplicity: STRING,
              targetMultiplicity: STRING,
              name: STRING,
            },
            ['source', 'target'],
          ),
          operation('remove_relation', { source: STRING, target: STRING }, [
            'source',
            'target',
          ]),
          operation('clear_diagram', {}, []),
        ],
      },
    },
  },
  required: ['reply', 'intent', 'changesSummary', 'operations'],
};

export interface MentorParticipant {
  userName: string;
  /** Sin valor: sigue solo el chat (sin un diagrama abierto). */
  canEdit?: boolean;
  /** Diagrama que tiene abierto, si lo hay. */
  diagramName?: string;
}

export interface MentorTurnContext {
  speaker: string;
  canEdit: boolean;
  prompt: string;
  channel: 'team' | 'direct';
  projectName?: string;
  /** Diagramas del proyecto, para que Trazo pueda nombrarlos o preguntar en cuál trabajar. */
  diagrams: { name: string; classCount: number }[];
  /** Lienzo sobre el que trabaja este mensaje, y por qué se eligió. */
  target?: { name: string; reason: TargetReason };
  participants: MentorParticipant[];
  /** Actividad de los lienzos ya redactada (ver describeActivity). */
  activity?: string;
  /** Problemas del diagrama detectados por el sistema, cuando piden una revisión. */
  findings?: string[];
  /** Configuración de Trazo del proyecto (cómo entrega y con qué estilo responde). */
  settings?: TrazoSettingsValues;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
}

/** Una entrada del registro de actividad, tal como la ve Trazo. */
export interface MentorActivityEntry {
  actorName: string;
  diagramName: string;
  summary: string;
  updatedAt: Date;
}

const MAX_ACTIVITY_LINE = 320;

/** «hace 25 min», «hace 3 h», «ayer», «hace 4 días». */
export function timeAgo(date: Date, now = new Date()): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/** Sección ACTIVIDAD EN LOS LIENZOS del prompt: un renglón por persona, diagrama y rato de trabajo. */
export function describeActivity(
  title: string,
  entries: MentorActivityEntry[],
  now = new Date(),
  note?: string,
): string {
  const lines = entries.map((e) => {
    const line = `- ${timeAgo(e.updatedAt, now)}, ${e.actorName} en ${diagramTag(e.diagramName)}: ${e.summary}`;
    return line.length > MAX_ACTIVITY_LINE
      ? `${line.slice(0, MAX_ACTIVITY_LINE - 1)}…`
      : line;
  });
  return `ACTIVIDAD EN LOS LIENZOS (${title}; lo más reciente primero):
${lines.length ? lines.join('\n') : '- sin cambios registrados'}${note ? `\n${note}` : ''}`;
}

const TARGET_REASONS: Record<TargetReason, string> = {
  tag: 'lo indicó con #',
  activity: 'es donde trabajó la persona de la que se habla',
  open: 'es el diagrama que tiene abierto',
  classes: 'es el único diagrama con las clases que menciona',
  thread: 'es el diagrama del que se venía hablando',
  only: 'es el único diagrama del proyecto',
};

/** Instrucción de sistema con el resumen de la conversación anterior, si existe. */
export function buildMentorInstruction(summary: string): string {
  return summary
    ? `${MENTOR_INSTRUCTION}
RESUMEN DE LA CONVERSACIÓN ANTERIOR DEL EQUIPO:
${summary}
`
    : MENTOR_INSTRUCTION;
}

/** Mensaje actual: proyecto, canal, quién está conectado, el lienzo y lo que dice la persona. */
export function buildMentorPrompt(ctx: MentorTurnContext): string {
  const people = ctx.participants.length
    ? ctx.participants
        .map((p) => {
          const role =
            p.canEdit === undefined
              ? 'solo el chat'
              : p.canEdit
                ? 'editor'
                : 'solo lectura';
          return `${p.userName} (${role}${p.diagramName ? `, en ${diagramTag(p.diagramName)}` : ''})`;
        })
        .join(', ')
    : ctx.speaker;
  const diagrams = ctx.diagrams.length
    ? ctx.diagrams
        .map((d) => `${diagramTag(d.name)} (${d.classCount} clases)`)
        .join(', ')
    : '(ninguno)';
  const channel =
    ctx.channel === 'team'
      ? 'canal del equipo: todos ven tu respuesta'
      : `conversación privada con ${ctx.speaker}: nadie más la ve`;
  const canvas = ctx.target
    ? `LIENZO: ${diagramTag(ctx.target.name)} (${TARGET_REASONS[ctx.target.reason]})

DIAGRAMA ACTUAL (${diagramTag(ctx.target.name)}):
${describeDiagram(ctx.nodes, ctx.connections)}${
        ctx.findings?.length
          ? `

OBSERVACIONES VERIFICADAS DEL DIAGRAMA (inclúyelas en tu revisión y propón corregirlas):
${ctx.findings.map((f) => `- ${f}`).join('\n')}`
          : ''
      }`
    : 'LIENZO: ninguno elegido. Si piden cambios, pregunta en qué diagrama.';

  return `${
    ctx.projectName
      ? `PROYECTO: ${ctx.projectName}
`
      : ''
  }DIAGRAMAS DEL PROYECTO: ${diagrams}
CONECTADOS AHORA: ${people}
DÓNDE: ${channel}

${settingsRules(ctx.settings || DEFAULT_TRAZO_SETTINGS)}
${ctx.activity ? `\n${ctx.activity}\n` : ''}
${canvas}

MENSAJE DE ${ctx.speaker} (${ctx.canEdit ? 'puede editar' : 'solo lectura: no puede editar'}):
"${ctx.prompt}"`;
}

/** Turno previo de un colaborador tal como lo ve el modelo: con su nombre delante. */
export function formatUserTurn(userName: string, text: string): string {
  return `${userName}: ${text}`;
}

export const SUMMARY_INSTRUCTION = `
Resumes la conversación de un equipo con Trazo, su mentor de UML, para que Trazo conserve el contexto.
Escribe en español, en viñetas breves (máximo 150 palabras): decisiones de modelado tomadas y por quién,
dudas que se explicaron, propuestas pendientes y preferencias de cada persona. Usa los nombres reales.
No inventes nada que no esté en el texto. Responde solo con el resumen.
`;

export function buildSummaryPrompt(
  previousSummary: string,
  transcript: string,
): string {
  return `${previousSummary ? `RESUMEN ANTERIOR:\n${previousSummary}\n\n` : ''}MENSAJES NUEVOS:\n${transcript}\n\nEscribe el resumen actualizado.`;
}
