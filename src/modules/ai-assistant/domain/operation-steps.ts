import { DiagramOperation } from './diagram-operations';

const RELATION_NAMES: Record<string, string> = {
  association: 'asociación',
  aggregation: 'agregación',
  composition: 'composición',
  generalization: 'herencia',
  realization: 'realización',
  dependency: 'dependencia',
};

type Member = { name: string; type?: string; returnType?: string };

const members = (list: Member[] = []) =>
  list
    .map((m) =>
      m.type || m.returnType ? `${m.name}: ${m.type || m.returnType}` : m.name,
    )
    .join(', ');

const ends = (op: {
  source: string;
  target: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}) => {
  const side = (name: string, mult?: string) =>
    mult ? `${name} (${mult})` : name;
  return `${side(op.source, op.sourceMultiplicity)} con ${side(op.target, op.targetMultiplicity)}`;
};

/**
 * Las operaciones como pasos para hacerlos a mano en el editor (modo «Solo explica»):
 * «crea la clase Pago con id: UUID, monto: BigDecimal».
 */
export function operationSteps(operations: DiagramOperation[]): string[] {
  return operations.flatMap((op): string[] => {
    switch (op.op) {
      case 'add_class': {
        const attrs = members(op.attributes);
        return [`crea la clase ${op.name}${attrs ? ` con ${attrs}` : ''}`];
      }
      case 'update_class': {
        const parts = [
          op.rename && `renómbrala a ${op.rename}`,
          op.clearAttributes && 'quítale todos los atributos',
          op.addAttributes?.length && `agrega ${members(op.addAttributes)}`,
          op.removeAttributes?.length &&
            `quita ${op.removeAttributes.join(', ')}`,
          ...(op.updateAttributes || []).map(
            (a) =>
              `cambia ${a.name}${a.newName ? ` a ${a.newName}` : ''}${a.type ? ` (${a.type})` : ''}`,
          ),
          op.clearMethods && 'quítale todos los métodos',
          op.addMethods?.length &&
            `agrega los métodos ${members(op.addMethods)}`,
          op.removeMethods?.length &&
            `quita los métodos ${op.removeMethods.join(', ')}`,
        ].filter(Boolean);
        return parts.length ? [`en ${op.target}, ${parts.join(', ')}`] : [];
      }
      case 'remove_class':
        return [`elimina la clase ${op.target}`];
      case 'add_relation':
        return [
          `relaciona ${ends(op)} con una ${RELATION_NAMES[op.type || 'association'] || op.type}${op.name ? ` «${op.name}»` : ''}`,
        ];
      case 'update_relation':
        return [
          `cambia la relación de ${ends(op)}${op.type ? ` a ${RELATION_NAMES[op.type] || op.type}` : ''}`,
        ];
      case 'remove_relation':
        return [`quita la relación entre ${op.source} y ${op.target}`];
      case 'clear_diagram':
        return ['selecciona todo el lienzo (Ctrl + A) y elimínalo'];
      default:
        return [];
    }
  });
}
