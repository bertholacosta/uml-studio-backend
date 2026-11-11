import { Injectable, BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import {
  EA_DIRECTIONS,
  DiagramAstData,
  UmlNodeData,
  UmlConnectionData,
  UmlAttributeData,
  UmlMethodData,
} from './xmi-exporter.service';

@Injectable()
export class XmiParserService {
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseAttributeValue: false,
      trimValues: true,
    });
  }

  /**
   * Parsea contenido XMI 2.1 (de Enterprise Architect u otras herramientas CASE)
   * y construye un AST de diagrama UML completo y listo para Foblex Flow y PostgreSQL.
   */
  parseXmi(xmlContent: string): DiagramAstData {
    if (!xmlContent || xmlContent.trim().length === 0) {
      throw new BadRequestException('El contenido XMI está vacío.');
    }

    let parsed: any;
    try {
      parsed = this.parser.parse(xmlContent);
    } catch (err: any) {
      throw new BadRequestException(
        `Error al parsear estructura XML: ${err?.message || err}`,
      );
    }

    const xmiRoot = parsed['xmi:XMI'] || parsed['XMI'] || parsed;
    if (!xmiRoot) {
      throw new BadRequestException(
        'Documento XML no contiene nodo raíz XMI válido.',
      );
    }

    // 1. Extraer nombre del diagrama: Enterprise Architect llama siempre «EA_Model» al modelo raíz,
    // así que el nombre útil es el del primer paquete propio (no los EA_* de tipos primitivos)
    const umlModel = xmiRoot['uml:Model'] || xmiRoot['Model'];
    const packages = [].concat(umlModel?.packagedElement || []) as any[];
    const userPackage = packages.find(
      (p) =>
        (p?.['@_xmi:type'] || '').endsWith('Package') &&
        p?.['@_name'] &&
        !p['@_name'].startsWith('EA_'),
    );
    const modelName =
      umlModel?.['@_name'] && umlModel['@_name'] !== 'EA_Model'
        ? umlModel['@_name']
        : undefined;
    const diagramName: string =
      userPackage?.['@_name'] || modelName || 'Diagrama Importado';

    // 2. Extraer mapas de geometría desde <xmi:Extension><diagrams><diagram><elements>
    const geometryMap = new Map<
      string,
      { left: number; top: number; width: number; height: number }
    >();
    const connectorLabelsMap = new Map<
      string,
      { name?: string; sMult?: string; tMult?: string }
    >();

    try {
      this.extractDiagramGeometry(xmiRoot, geometryMap);
    } catch {
      // Si falla la extracción de diagramas, continúa con layout automático
    }

    // 3. Extraer Clases y Elementos
    const nodeMap = new Map<string, UmlNodeData>();
    const rawPackagedElements = this.collectPackagedElements(umlModel);

    let gridIndex = 0;
    for (const elem of rawPackagedElements) {
      const type = elem['@_xmi:type'] || elem['@_type'];
      const id = elem['@_xmi:id'] || elem['@_id'];
      const name = elem['@_name'];

      if (!id) continue;

      if (
        type === 'uml:Class' ||
        type === 'uml:AssociationClass' ||
        type === 'Class'
      ) {
        const attributes = this.extractAttributes(elem);
        const methods = this.extractMethods(elem);

        // Coordenadas
        let pos = {
          x: 80 + (gridIndex % 3) * 280,
          y: 80 + Math.floor(gridIndex / 3) * 220,
        };
        let width = 220;
        let height = 120;

        if (geometryMap.has(id)) {
          const g = geometryMap.get(id)!;
          pos = { x: g.left, y: g.top };
          if (g.width > 50) width = g.width;
          if (g.height > 40) height = g.height;
        }

        const nodeData: UmlNodeData = {
          id,
          name: name || `Class_${gridIndex + 1}`,
          position: pos,
          width,
          height,
          attributes,
          methods,
          isAnchor: false,
        };

        nodeMap.set(id, nodeData);
        gridIndex++;
      }
    }

    // 4. Extraer Conexiones (Asociaciones, Generalizaciones, etc.)
    const connections: UmlConnectionData[] = [];
    const connectionSet = new Set<string>();

    for (const elem of rawPackagedElements) {
      const type = elem['@_xmi:type'] || elem['@_type'];

      // A) Asociaciones UML
      if (
        type === 'uml:Association' ||
        type === 'Association' ||
        type === 'uml:AssociationClass'
      ) {
        const connData = this.parseAssociation(
          elem,
          nodeMap,
          connectorLabelsMap,
        );
        if (connData && !connectionSet.has(connData.id)) {
          connectionSet.add(connData.id);
          connections.push(connData);
        }
      }

      // B) Generalizaciones internas en clases
      if (type === 'uml:Class' || type === 'Class') {
        const genConns = this.parseClassGeneralizations(elem, nodeMap);
        for (const gc of genConns) {
          if (!connectionSet.has(gc.id)) {
            connectionSet.add(gc.id);
            connections.push(gc);
          }
        }
      }
    }

    // C) Conectores de la extensión de EA (si no se encontraron en <uml:Model>)
    const eaConnectors = this.extractEaExtensionConnectors(xmiRoot, nodeMap);
    for (const ec of eaConnectors) {
      if (!connectionSet.has(ec.id)) {
        connectionSet.add(ec.id);
        connections.push(ec);
      }
    }

    return {
      name: diagramName,
      nodes: Array.from(nodeMap.values()),
      connections,
    };
  }

  private collectPackagedElements(modelRoot: any): any[] {
    const list: any[] = [];
    if (!modelRoot) return list;

    const traverse = (node: any) => {
      if (!node) return;

      const pkged = node['packagedElement'] || node['ownedMember'];
      if (pkged) {
        if (Array.isArray(pkged)) {
          for (const item of pkged) {
            list.push(item);
            traverse(item);
          }
        } else if (typeof pkged === 'object') {
          list.push(pkged);
          traverse(pkged);
        }
      }
    };

    traverse(modelRoot);
    return list;
  }

  private extractAttributes(classElem: any): UmlAttributeData[] {
    const attrs: UmlAttributeData[] = [];
    const ownedAttributes =
      classElem['ownedAttribute'] || classElem['attribute'];
    if (!ownedAttributes) return attrs;

    const rawList = Array.isArray(ownedAttributes)
      ? ownedAttributes
      : [ownedAttributes];
    for (const raw of rawList) {
      const name = raw['@_name'];
      if (!name) continue;

      let type = 'String';
      const typeElem = raw['type'];
      if (typeElem) {
        if (typeElem['@_xmi:idref']) {
          type = this.cleanTypeName(typeElem['@_xmi:idref']);
        } else if (typeElem['@_name']) {
          type = typeElem['@_name'];
        } else if (typeof typeElem === 'string') {
          type = this.cleanTypeName(typeElem);
        }
      } else if (raw['@_type']) {
        type = this.cleanTypeName(raw['@_type']);
      }

      const visibility = raw['@_visibility'] || 'private';
      const isUnique =
        raw['@_isUnique'] === 'true' || raw['@_isUnique'] === true;

      attrs.push({
        name,
        type: this.mapJavaTypeToUml(type),
        visibility,
        isPk:
          isUnique &&
          (name.toLowerCase().endsWith('id') || name.toLowerCase() === 'id'),
        isNullable: false,
      });
    }

    return attrs;
  }

  private extractMethods(classElem: any): UmlMethodData[] {
    const methods: UmlMethodData[] = [];
    const ownedOperations =
      classElem['ownedOperation'] || classElem['operation'];
    if (!ownedOperations) return methods;

    const rawList = Array.isArray(ownedOperations)
      ? ownedOperations
      : [ownedOperations];
    for (const raw of rawList) {
      const name = raw['@_name'];
      if (!name) continue;

      let returnType = 'void';
      const paramList: string[] = [];

      const rawParams = raw['ownedParameter'] || raw['parameter'];
      if (rawParams) {
        const pList = Array.isArray(rawParams) ? rawParams : [rawParams];
        for (const p of pList) {
          const pName = p['@_name'] || 'param';
          const pDirection = p['@_direction'];
          let pType = 'String';

          if (p['type'] && p['type']['@_xmi:idref']) {
            pType = this.cleanTypeName(p['type']['@_xmi:idref']);
          } else if (p['@_type']) {
            pType = this.cleanTypeName(p['@_type']);
          }

          pType = this.mapJavaTypeToUml(pType);

          if (pDirection === 'return' || pName === 'return') {
            returnType = pType;
          } else {
            paramList.push(`${pName}: ${pType}`);
          }
        }
      }

      methods.push({
        name,
        returnType,
        parameters: paramList.join(', '),
        visibility: raw['@_visibility'] || 'public',
      });
    }

    return methods;
  }

  private parseAssociation(
    assocElem: any,
    nodeMap: Map<string, UmlNodeData>,
    connectorLabelsMap: Map<string, any>,
  ): UmlConnectionData | null {
    const id =
      assocElem['@_xmi:id'] || assocElem['@_id'] || `conn_${Date.now()}`;
    const name = assocElem['@_name'] || '';

    // Priorizar ownedEnd con definiciones de tipo
    let ends = assocElem['ownedEnd'];
    if (!ends || (Array.isArray(ends) && ends.length < 2)) {
      ends = assocElem['memberEnd'] || ends;
    }
    if (!ends) return null;

    const rawEnds = (Array.isArray(ends) ? ends : [ends]).filter(
      (e: any) => !!e,
    );
    const endsWithTypes = rawEnds.filter((e: any) => !!e.type || !!e['@_type']);
    const listToUse = endsWithTypes.length >= 2 ? endsWithTypes : rawEnds;

    if (listToUse.length < 2) return null;

    let sourceNodeId = '';
    let targetNodeId = '';
    let sourceMultiplicity = '';
    let targetMultiplicity = '';
    let aggregationType = 'none';

    const end0 = listToUse[0];
    const end1 = listToUse[1];
    let sourceEnd = end0;
    let targetEnd = end1;

    const typeId0 = end0.type
      ? end0.type['@_xmi:idref'] ||
        end0.type['@_type'] ||
        (typeof end0.type === 'string' ? end0.type : '')
      : end0['@_type'] || '';
    const typeId1 = end1.type
      ? end1.type['@_xmi:idref'] ||
        end1.type['@_type'] ||
        (typeof end1.type === 'string' ? end1.type : '')
      : end1['@_type'] || '';

    const id0 = (end0['@_xmi:id'] || end0['@_id'] || '').toLowerCase();
    const id1 = (end1['@_xmi:id'] || end1['@_id'] || '').toLowerCase();

    if (id0.includes('src') || id1.includes('dst')) {
      sourceNodeId = typeId0;
      targetNodeId = typeId1;
      sourceMultiplicity = this.extractMultiplicity(end0);
      targetMultiplicity = this.extractMultiplicity(end1);
      if (end0['@_aggregation'] && end0['@_aggregation'] !== 'none')
        aggregationType = end0['@_aggregation'];
      if (end1['@_aggregation'] && end1['@_aggregation'] !== 'none')
        aggregationType = end1['@_aggregation'];
    } else if (id1.includes('src') || id0.includes('dst')) {
      sourceNodeId = typeId1;
      targetNodeId = typeId0;
      sourceEnd = end1;
      targetEnd = end0;
      sourceMultiplicity = this.extractMultiplicity(end1);
      targetMultiplicity = this.extractMultiplicity(end0);
      if (end1['@_aggregation'] && end1['@_aggregation'] !== 'none')
        aggregationType = end1['@_aggregation'];
      if (end0['@_aggregation'] && end0['@_aggregation'] !== 'none')
        aggregationType = end0['@_aggregation'];
    } else {
      sourceNodeId = typeId0;
      targetNodeId = typeId1;
      sourceMultiplicity = this.extractMultiplicity(end0);
      targetMultiplicity = this.extractMultiplicity(end1);
      if (end0['@_aggregation'] && end0['@_aggregation'] !== 'none')
        aggregationType = end0['@_aggregation'];
      if (end1['@_aggregation'] && end1['@_aggregation'] !== 'none')
        aggregationType = end1['@_aggregation'];
    }

    // Validar que ambos nodos existan
    if (!nodeMap.has(sourceNodeId) || !nodeMap.has(targetNodeId)) {
      return null;
    }

    // Determinar tipo de relación UML
    let type = 'association';
    if (aggregationType === 'composite') {
      type = 'composition';
    } else if (aggregationType === 'shared') {
      type = 'aggregation';
    }

    // Buscar multiplicidades en el mapa de labels si no se hallaron
    if (connectorLabelsMap.has(id)) {
      const lbl = connectorLabelsMap.get(id)!;
      if (!sourceMultiplicity && lbl.sMult) sourceMultiplicity = lbl.sMult;
      if (!targetMultiplicity && lbl.tMult) targetMultiplicity = lbl.tMult;
    }

    return {
      id,
      sourceNodeId,
      targetNodeId,
      sourceId: `${sourceNodeId}_right`,
      targetId: `${targetNodeId}_left`,
      type,
      name: name || undefined,
      sourceMultiplicity,
      targetMultiplicity,
      sourceRole: sourceEnd['@_name'] || undefined,
      targetRole: targetEnd['@_name'] || undefined,
      navigability: this.navigabilityOf(assocElem, sourceEnd, targetEnd),
    };
  }

  /**
   * Un extremo es navegable si la asociación lo declara en navigableOwnedEnd (o, en XMI
   * antiguos, si lleva isNavigable="true").
   */
  private navigabilityOf(
    assocElem: any,
    sourceEnd: any,
    targetEnd: any,
  ): string {
    const declared = assocElem['navigableOwnedEnd'];
    const navigableIds = new Set(
      (Array.isArray(declared) ? declared : declared ? [declared] : []).map(
        (n: any) => n?.['@_xmi:idref'] || n?.['@_idref'],
      ),
    );
    const isNavigable = (end: any) =>
      navigableIds.has(end['@_xmi:id'] || end['@_id']) ||
      String(end['@_isNavigable']) === 'true';
    const toSource = isNavigable(sourceEnd);
    const toTarget = isNavigable(targetEnd);
    if (toSource && toTarget) return 'both';
    if (toTarget) return 'to_target';
    if (toSource) return 'to_source';
    return 'unspecified';
  }

  private parseClassGeneralizations(
    classElem: any,
    nodeMap: Map<string, UmlNodeData>,
  ): UmlConnectionData[] {
    const conns: UmlConnectionData[] = [];
    const sourceId = classElem['@_xmi:id'] || classElem['@_id'];
    if (!sourceId || !nodeMap.has(sourceId)) return conns;

    const generalizations = classElem['generalization'];
    if (!generalizations) return conns;

    const rawList = Array.isArray(generalizations)
      ? generalizations
      : [generalizations];
    for (const g of rawList) {
      const targetId =
        g['@_general'] || (g['general'] && g['general']['@_xmi:idref']);
      if (targetId && nodeMap.has(targetId)) {
        const id = g['@_xmi:id'] || `gen_${sourceId}_${targetId}`;
        conns.push({
          id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceId: `${sourceId}_top`,
          targetId: `${targetId}_bottom`,
          type: 'generalization',
          sourceMultiplicity: '',
          targetMultiplicity: '',
        });
      }
    }

    return conns;
  }

  private extractEaExtensionConnectors(
    xmiRoot: any,
    nodeMap: Map<string, UmlNodeData>,
  ): UmlConnectionData[] {
    const conns: UmlConnectionData[] = [];
    const ext = xmiRoot['xmi:Extension'] || xmiRoot['Extension'];
    if (!ext) return conns;

    const connectorsContainer = ext['connectors'];
    if (!connectorsContainer) return conns;

    const connectorList = connectorsContainer['connector'];
    if (!connectorList) return conns;

    const rawList = Array.isArray(connectorList)
      ? connectorList
      : [connectorList];
    for (const c of rawList) {
      const id = c['@_xmi:idref'] || c['@_id'] || `conn_${Date.now()}`;
      const source = c['source'];
      const target = c['target'];
      if (!source || !target) continue;

      const sourceId =
        source['@_xmi:idref'] ||
        (source['model'] && source['model']['@_ea_localid']);
      const targetId =
        target['@_xmi:idref'] ||
        (target['model'] && target['model']['@_ea_localid']);

      if (
        !sourceId ||
        !targetId ||
        !nodeMap.has(sourceId) ||
        !nodeMap.has(targetId)
      )
        continue;

      const eaProps = c['properties'] || {};
      const eaType = eaProps['@_ea_type'] || 'Association';

      let type = 'association';
      if (eaType === 'Generalization') type = 'generalization';
      else if (eaType === 'Realisation') type = 'realization';
      else if (eaType === 'Dependency') type = 'dependency';

      const srcType = source['type'] || {};
      const tgtType = target['type'] || {};
      if (
        srcType['@_aggregation'] === 'composite' ||
        tgtType['@_aggregation'] === 'composite'
      ) {
        type = 'composition';
      } else if (
        srcType['@_aggregation'] === 'shared' ||
        tgtType['@_aggregation'] === 'shared'
      ) {
        type = 'aggregation';
      }

      const labels = c['labels'] || {};
      const sMult = labels['@_lb'] || srcType['@_multiplicity'] || '';
      const tMult = labels['@_rb'] || tgtType['@_multiplicity'] || '';
      const name = labels['@_mb'] || undefined;
      const direction = String(eaProps['@_direction'] || '');
      const navigability =
        Object.keys(EA_DIRECTIONS).find(
          (key) => EA_DIRECTIONS[key] === direction,
        ) || 'unspecified';

      conns.push({
        id,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        sourceId: `${sourceId}_right`,
        targetId: `${targetId}_left`,
        type,
        name,
        sourceMultiplicity: sMult,
        targetMultiplicity: tMult,
        sourceRole: source['role']?.['@_name'] || undefined,
        targetRole: target['role']?.['@_name'] || undefined,
        navigability,
      });
    }

    return conns;
  }

  private extractDiagramGeometry(
    xmiRoot: any,
    geometryMap: Map<
      string,
      { left: number; top: number; width: number; height: number }
    >,
  ): void {
    const ext = xmiRoot['xmi:Extension'] || xmiRoot['Extension'];
    if (!ext) return;

    const diagrams = ext['diagrams'];
    if (!diagrams) return;

    const diagramList = diagrams['diagram'];
    if (!diagramList) return;

    const primaryDiagram = Array.isArray(diagramList)
      ? diagramList[0]
      : diagramList;
    if (!primaryDiagram) return;

    const elementsContainer = primaryDiagram['elements'];
    if (!elementsContainer) return;

    const elementList = elementsContainer['element'];
    if (!elementList) return;

    const rawList = Array.isArray(elementList) ? elementList : [elementList];
    for (const elem of rawList) {
      const subject = elem['@_subject'];
      const geometry = elem['@_geometry'];

      if (subject && geometry) {
        // Parsear: Left=54;Top=21;Right=168;Bottom=112;
        const leftMatch = geometry.match(/Left=(-?\d+)/);
        const topMatch = geometry.match(/Top=(-?\d+)/);
        const rightMatch = geometry.match(/Right=(-?\d+)/);
        const bottomMatch = geometry.match(/Bottom=(-?\d+)/);

        if (leftMatch && topMatch && rightMatch && bottomMatch) {
          const left = parseInt(leftMatch[1], 10);
          const top = parseInt(topMatch[1], 10);
          const right = parseInt(rightMatch[1], 10);
          const bottom = parseInt(bottomMatch[1], 10);

          geometryMap.set(subject, {
            left: Math.max(20, left),
            top: Math.max(20, top),
            width: Math.max(160, right - left),
            height: Math.max(60, bottom - top),
          });
        }
      }
    }
  }

  private extractMultiplicity(endElem: any): string {
    const lowerElem = endElem['lowerValue'];
    const upperElem = endElem['upperValue'];

    const lower = lowerElem
      ? lowerElem['@_value'] !== undefined
        ? String(lowerElem['@_value'])
        : '1'
      : '';
    const upper = upperElem
      ? upperElem['@_value'] !== undefined
        ? String(upperElem['@_value'])
        : '1'
      : '';

    if (lower === '0' && (upper === '-1' || upper === '*')) return '0..*';
    if (lower === '1' && (upper === '-1' || upper === '*')) return '1..*';
    if (lower === '0' && upper === '1') return '0..1';
    if (lower === '1' && upper === '1') return '1';
    if (upper === '-1') return '*';
    if (lower && upper && lower !== upper) return `${lower}..${upper}`;
    return upper || lower || '';
  }

  private cleanTypeName(raw: string): string {
    if (!raw) return 'String';
    return raw.replace(/^EAJava_/, '').replace(/^uml:/, '');
  }

  private mapJavaTypeToUml(type: string): string {
    const lower = (type || '').toLowerCase().trim();
    if (lower === 'uuid') return 'UUID';
    if (lower === 'string' || lower === 'text' || lower === 'varchar')
      return 'String';
    if (lower === 'int' || lower === 'integer') return 'Integer';
    if (lower === 'long' || lower === 'bigint') return 'Long';
    if (lower === 'bool' || lower === 'boolean') return 'Boolean';
    if (lower === 'double') return 'Double';
    if (lower === 'float') return 'Float';
    if (lower === 'bigdecimal' || lower === 'decimal' || lower === 'numeric')
      return 'BigDecimal';
    if (lower === 'localdate' || lower === 'date') return 'LocalDate';
    if (lower === 'localdatetime' || lower === 'timestamp')
      return 'LocalDateTime';
    if (lower === 'void') return 'void';
    return type || 'String';
  }
}
