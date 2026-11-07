/** Persona del proyecto. */
export interface ProjectMember {
  userId: string;
  userName: string;
}

/**
 * Qué actividad del lienzo le interesa a un mensaje: de quién («¿qué hizo Marco?», «revisa lo
 * que hice») o si pide ponerse al día («¿qué han avanzado?», «ponme al día»).
 */
export interface ActivityFocus {
  /** Personas de cuyo trabajo se habla (incluye a quien escribe si dice «lo que hice»). */
  people: ProjectMember[];
  /** Habla del trabajo de esas personas (no solo las nombra). */
  aboutWork: boolean;
  /** Pide un resumen de lo que pasó, en general o desde su última conexión. */
  catchUp: boolean;
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const AUTHORSHIP =
  /\b(?:hizo|hice|hiciste|hicieron|hicimos|hecho|cambio|cambiaron|cambie|agrego|agregue|anadio|anadi|creo|cree|elimino|borro|trabajo|avanzo|avanzaron|aporto|modifico|modifique|lo de|su parte|sus cambios|mis cambios|mi parte|su trabajo|mi trabajo)\b/;
const SELF =
  /\b(?:lo que hice|lo que he hecho|mis cambios|mi parte|mi trabajo|lo que agregue|lo que cree|lo que cambie|lo que modifique)\b/;
const CATCH_UP =
  /\b(?:al dia|novedades|que hay de nuevo|que (?:han|hemos) (?:hecho|avanzado|cambiado)|que hicieron|que avanzaron|cuanto (?:han|hemos) avanzado|avances?|avanzado|desde (?:ayer|anoche|mi ultima|la ultima|que me fui|que sali)|ultima conexion|me perdi|que paso|resumen de (?:lo|los cambios|la actividad))\b/;

/** Nombres con los que se puede nombrar a alguien: el completo y el de pila (si es único). */
function namesOf(member: ProjectMember, members: ProjectMember[]): string[] {
  const full = plain(member.userName).trim();
  const first = full.split(/\s+/)[0];
  const sameFirst = members.filter(
    (m) => plain(m.userName).split(/\s+/)[0] === first,
  ).length;
  return sameFirst > 1 || first.length < 3 ? [full] : [full, first];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function activityFocus(
  text: string,
  members: ProjectMember[],
  speaker: ProjectMember,
): ActivityFocus {
  const normalized = plain(text);
  const people = members.filter(
    (m) =>
      m.userId !== speaker.userId &&
      namesOf(m, members).some((name) =>
        new RegExp(
          `(?:^|[^\\p{L}\\d])@?${escape(name)}(?![\\p{L}\\d])`,
          'u',
        ).test(normalized),
      ),
  );
  if (SELF.test(normalized)) people.push(speaker);
  return {
    people,
    aboutWork: people.length > 0 && AUTHORSHIP.test(normalized),
    catchUp: CATCH_UP.test(normalized),
  };
}
