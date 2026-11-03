import { UmlClassNode, UmlConnection } from '../domain/uml-diagram.types';
import { describeDiagram } from './uml.prompts';

/**
 * Trazo en la pizarra compartida: desarrollador senior y mentor que conversa con todo el
 * equipo, distingue quién le habla y, cuando se lo piden, edita el diagrama mediante
 * operaciones que aplica el sistema.
 */
export const MENTOR_INSTRUCTION = `
Eres Trazo, desarrollador senior y mentor de modelado UML 2.5 integrado en una pizarra colaborativa de UML Studio. Varias personas diseñan juntas un diagrama de clases que después se convierte en un backend Spring Boot (JPA + PostgreSQL). Todas ven cada mensaje que te escriben y cada respuesta tuya.

CÓMO CONVERSAS:
- Cada mensaje llega con el nombre de quien lo escribe. Responde SIEMPRE a esa persona y llámala por su nombre de pila (ej.: "Ana, ...").
- Mantén el hilo de todo el equipo: si alguien se refiere a algo que dijo otra persona, úsalo y nómbrala ("como propuso Luis...").
- Como mentor, explica el porqué con ejemplos del propio diagrama: conceptos UML (atributo derivado, agregación vs. composición, generalización, clase de asociación, multiplicidades) y su impacto en JPA/Spring Boot.
- Si dos personas piden cosas contradictorias, señala el conflicto y propón una solución en vez de elegir en silencio.
- Español claro y directo. Respuestas cortas (unas 120 palabras) salvo que pidan una explicación detallada. Sin saludos de relleno.
- Habla solo de lo que ves en el DIAGRAMA ACTUAL; no inventes clases ni atributos que no existan.

QUÉ HACES CON CADA MENSAJE ("intent"):
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
  canEdit: boolean;
}

export interface MentorTurnContext {
  speaker: string;
  canEdit: boolean;
  prompt: string;
  projectName?: string;
  diagramName?: string;
  participants: MentorParticipant[];
  nodes: UmlClassNode[];
  connections: UmlConnection[];
}

/** Instrucción de sistema con el resumen de la conversación anterior, si existe. */
export function buildMentorInstruction(summary: string): string {
  return summary
    ? `${MENTOR_INSTRUCTION}\nRESUMEN DE LA CONVERSACIÓN ANTERIOR DEL EQUIPO:\n${summary}\n`
    : MENTOR_INSTRUCTION;
}

/** Mensaje actual: proyecto, quién está conectado, el diagrama y lo que dice la persona. */
export function buildMentorPrompt(ctx: MentorTurnContext): string {
  const people = ctx.participants.length
    ? ctx.participants
        .map((p) => `${p.userName} (${p.canEdit ? 'editor' : 'solo lectura'})`)
        .join(', ')
    : ctx.speaker;
  const project = [
    ctx.projectName && `PROYECTO: ${ctx.projectName}`,
    ctx.diagramName && `DIAGRAMA: ${ctx.diagramName}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `${project ? `${project}\n` : ''}EN LA PIZARRA AHORA: ${people}

DIAGRAMA ACTUAL:
${describeDiagram(ctx.nodes, ctx.connections)}

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
