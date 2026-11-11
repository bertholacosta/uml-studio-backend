import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface UmlAttributeData {
  name: string;
  type: string;
  visibility?: string;
  isPk?: boolean;
  isNullable?: boolean;
}

export interface UmlMethodData {
  name: string;
  returnType?: string;
  parameters?: string;
  visibility?: string;
}

export interface UmlNodeData {
  id: string;
  name: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  attributes?: UmlAttributeData[];
  methods?: UmlMethodData[];
  isAnchor?: boolean;
  assocMainConnId?: string;
}

export interface UmlConnectionData {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceId?: string;
  targetId?: string;
  type: string;
  name?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  sourceRole?: string;
  targetRole?: string;
  /** unspecified | to_target | to_source | both */
  navigability?: string;
  assocAnchorNodeId?: string;
}

export interface DiagramAstData {
  name: string;
  nodes: UmlNodeData[];
  connections: UmlConnectionData[];
}

// En Enterprise Architect el modo 1 es «Direct»: las relaciones se exportan como líneas rectas
const EA_DIRECT_LINE_MODE = '1';

/** Navegabilidad de la relación en el atributo «direction» de Enterprise Architect. */
export const EA_DIRECTIONS: Record<string, string> = {
  to_target: 'Source -> Destination',
  to_source: 'Destination -> Source',
  both: 'Bi-Directional',
};

@Injectable()
export class XmiExporterService {
  /**
   * Genera un XMI 2.1 completo estándar compatible con Enterprise Architect v17,
   * incluyendo empaquetado UML, extensiones completas de Enterprise Architect y
   * la sección gráfica de diagrama con coordenadas geométricas precisas.
   */
  exportToXmi(diagram: DiagramAstData): string {
    const pkgGuid = this.generateGuid();
    const diagramGuid = this.generateGuid();
    const packageName = diagram.name || 'Diagrama_Principal';
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Mapeo de IDs internos a IDs EA estables
    const nodeEaIdMap = new Map<string, string>();
    const nodeDuidMap = new Map<string, string>();
    const connEaIdMap = new Map<string, string>();

    // Filtrar nodos ancla internos de UI si no son relevantes para el modelo CASE
    const visibleNodes = (diagram.nodes || []).filter((n) => !n.isAnchor);

    for (const node of visibleNodes) {
      const eaId = `EAID_${this.generateGuid()}`;
      const duid = this.generateDuid(node.id);
      nodeEaIdMap.set(node.id, eaId);
      nodeDuidMap.set(node.id, duid);
    }

    // Identificar conexiones válidas
    const validConnections = (diagram.connections || []).filter((c) => {
      const s =
        c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const t =
        c.targetNodeId || c.targetId?.replace(/_(top|bottom|left|right)$/, '');
      return nodeEaIdMap.has(s) && nodeEaIdMap.has(t);
    });

    for (const conn of validConnections) {
      const connEaId = `EAID_${this.generateGuid()}`;
      connEaIdMap.set(conn.id, connEaId);
    }

    // 1. CONSTRUIR ELEMENTOS UML DEL MODELO
    let umlPackagedElements = '';
    let eaElementsXml = '';
    let eaConnectorsXml = '';
    let eaDiagramElementsXml = '';

    // Elemento de paquete en EA extension
    eaElementsXml += `\t\t\t<element xmi:idref="EAPK_${pkgGuid}" xmi:type="uml:Package" name="${this.escapeXml(packageName)}" scope="public">\n`;
    eaElementsXml += `\t\t\t\t<model package2="EAID_${pkgGuid}" package="EAPK_${pkgGuid}" tpos="1" ea_localid="1" ea_eleType="package"/>\n`;
    eaElementsXml += `\t\t\t\t<properties isSpecification="false" sType="Package" nType="0" scope="public"/>\n`;
    eaElementsXml += `\t\t\t\t<project author="UML Studio" version="1.0" phase="1.0" created="${now}" modified="${now}" complexity="1" status="Proposed"/>\n`;
    eaElementsXml += `\t\t\t\t<code gentype="&lt;none&gt;"/>\n`;
    eaElementsXml += `\t\t\t\t<style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>\n`;
    eaElementsXml += `\t\t\t\t<tags/>\n`;
    eaElementsXml += `\t\t\t\t<xrefs/>\n`;
    eaElementsXml += `\t\t\t\t<extendedProperties tagged="0" package_name="Model"/>\n`;
    eaElementsXml += `\t\t\t\t<packageproperties version="1.0" tpos="1"/>\n`;
    eaElementsXml += `\t\t\t\t<paths/>\n`;
    eaElementsXml += `\t\t\t\t<times created="${now}" modified="${now}" lastloaddate="${now}" lastsavedate="${now}"/>\n`;
    eaElementsXml += `\t\t\t\t<flags iscontrolled="0" isprotected="0" batchsave="0" batchload="0" usedtd="0" logxml="0" packageFlags="VICON=3;"/>\n`;
    eaElementsXml += `\t\t\t</element>\n`;

    // Procesar cada clase
    let seqno = 1;
    for (const node of visibleNodes) {
      const eaId = nodeEaIdMap.get(node.id)!;
      const duid = nodeDuidMap.get(node.id)!;

      // PackagedElement en <uml:Model>
      umlPackagedElements += `\t\t\t<packagedElement xmi:type="uml:Class" xmi:id="${eaId}" name="${this.escapeXml(node.name)}" visibility="public">\n`;

      let eaAttributesXml = '';
      let eaOperationsXml = '';

      // Atributos
      if (node.attributes && node.attributes.length > 0) {
        for (let i = 0; i < node.attributes.length; i++) {
          const attr = node.attributes[i];
          const attrId = `EAID_${this.generateGuid()}`;
          const attrType = attr.type || 'String';
          const eaTypeRef = this.getEaTypeReference(attrType);

          umlPackagedElements += `\t\t\t\t<ownedAttribute xmi:type="uml:Property" xmi:id="${attrId}" name="${this.escapeXml(attr.name)}" visibility="${(attr.visibility || 'private').toLowerCase()}" isStatic="false" isReadOnly="false" isDerived="false" isOrdered="false" isUnique="${attr.isPk ? 'true' : 'false'}" isDerivedUnion="false">\n`;
          umlPackagedElements += `\t\t\t\t\t<lowerValue xmi:type="uml:LiteralInteger" xmi:id="EAID_LI_${this.generateGuid().substring(0, 8)}" value="1"/>\n`;
          umlPackagedElements += `\t\t\t\t\t<upperValue xmi:type="uml:LiteralInteger" xmi:id="EAID_UI_${this.generateGuid().substring(0, 8)}" value="1"/>\n`;
          umlPackagedElements += `\t\t\t\t\t<type xmi:idref="${eaTypeRef}"/>\n`;
          umlPackagedElements += `\t\t\t\t</ownedAttribute>\n`;

          eaAttributesXml += `\t\t\t\t\t<attribute xmi:idref="${attrId}" name="${this.escapeXml(attr.name)}" scope="${this.capitalize(attr.visibility || 'Private')}">\n`;
          eaAttributesXml += `\t\t\t\t\t\t<properties type="${this.escapeXml(attrType)}" derived="0" precision="0" collection="false" length="0" static="0" duplicates="0" changeability="changeable"/>\n`;
          eaAttributesXml += `\t\t\t\t\t\t<containment containment="Not Specified" position="${i}"/>\n`;
          eaAttributesXml += `\t\t\t\t\t\t<bounds lower="1" upper="1"/>\n`;
          eaAttributesXml += `\t\t\t\t\t</attribute>\n`;
        }
      }

      // Métodos / Operaciones
      if (node.methods && node.methods.length > 0) {
        for (let i = 0; i < node.methods.length; i++) {
          const method = node.methods[i];
          const opId = `EAID_${this.generateGuid()}`;
          const retType = method.returnType || 'void';
          const eaRetTypeRef = this.getEaTypeReference(retType);

          umlPackagedElements += `\t\t\t\t<ownedOperation xmi:id="${opId}" name="${this.escapeXml(method.name)}" visibility="${(method.visibility || 'public').toLowerCase()}" concurrency="sequential">\n`;
          umlPackagedElements += `\t\t\t\t\t<ownedParameter xmi:id="EAID_RET_${this.generateGuid().substring(0, 8)}" name="return" direction="return" type="${eaRetTypeRef}"/>\n`;

          // Parámetros
          if (method.parameters && method.parameters.trim().length > 0) {
            const rawParams = method.parameters.split(',');
            for (const paramStr of rawParams) {
              const parts = paramStr.split(':');
              const pName = parts[0]?.trim() || 'param';
              const pType = parts[1]?.trim() || 'String';
              umlPackagedElements += `\t\t\t\t\t<ownedParameter xmi:id="EAID_P_${this.generateGuid().substring(0, 8)}" name="${this.escapeXml(pName)}" type="${this.getEaTypeReference(pType)}"/>\n`;
            }
          }
          umlPackagedElements += `\t\t\t\t</ownedOperation>\n`;

          eaOperationsXml += `\t\t\t\t\t<operation xmi:idref="${opId}" name="${this.escapeXml(method.name)}" scope="${this.capitalize(method.visibility || 'Public')}">\n`;
          eaOperationsXml += `\t\t\t\t\t\t<properties position="${i}"/>\n`;
          eaOperationsXml += `\t\t\t\t\t\t<type type="${this.escapeXml(retType)}" const="false" static="false" isAbstract="false" concurrency="Sequential" pure="0"/>\n`;
          eaOperationsXml += `\t\t\t\t\t</operation>\n`;
        }
      }

      // Generalizaciones salientes (Herencia)
      const outGeneralizations = validConnections.filter((c) => {
        const s =
          c.sourceNodeId ||
          c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
        return s === node.id && c.type === 'generalization';
      });

      for (const gen of outGeneralizations) {
        const targetId =
          gen.targetNodeId ||
          gen.targetId?.replace(/_(top|bottom|left|right)$/, '');
        const targetEaId = nodeEaIdMap.get(targetId);
        if (targetEaId) {
          umlPackagedElements += `\t\t\t\t<generalization xmi:type="uml:Generalization" xmi:id="EAID_GEN_${this.generateGuid().substring(0, 8)}" general="${targetEaId}"/>\n`;
        }
      }

      umlPackagedElements += `\t\t\t</packagedElement>\n`;

      // Elemento en EA Extension
      eaElementsXml += `\t\t\t<element xmi:idref="${eaId}" xmi:type="uml:Class" name="${this.escapeXml(node.name)}" scope="public">\n`;
      eaElementsXml += `\t\t\t\t<model package="EAPK_${pkgGuid}" tpos="0" ea_eleType="element"/>\n`;
      eaElementsXml += `\t\t\t\t<properties isSpecification="false" sType="Class" nType="0" scope="public" isRoot="false" isLeaf="false" isAbstract="false" isActive="false"/>\n`;
      eaElementsXml += `\t\t\t\t<project author="UML Studio" version="1.0" phase="1.0" created="${now}" modified="${now}" complexity="1" status="Proposed"/>\n`;
      eaElementsXml += `\t\t\t\t<code product_name="Java" gentype="Java"/>\n`;
      eaElementsXml += `\t\t\t\t<style appearance="BackColor=-1;BorderColor=-1;BorderWidth=-1;FontColor=-1;VSwimLanes=1;HSwimLanes=1;BorderStyle=0;"/>\n`;
      eaElementsXml += `\t\t\t\t<extendedProperties tagged="0" package_name="${this.escapeXml(packageName)}"/>\n`;

      if (eaAttributesXml) {
        eaElementsXml += `\t\t\t\t<attributes>\n${eaAttributesXml}\t\t\t\t</attributes>\n`;
      }
      if (eaOperationsXml) {
        eaElementsXml += `\t\t\t\t<operations>\n${eaOperationsXml}\t\t\t\t</operations>\n`;
      }

      // Links (relaciones entrantes o salientes de esta clase)
      const classConns = validConnections.filter((c) => {
        const s =
          c.sourceNodeId ||
          c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
        const t =
          c.targetNodeId ||
          c.targetId?.replace(/_(top|bottom|left|right)$/, '');
        return s === node.id || t === node.id;
      });

      if (classConns.length > 0) {
        eaElementsXml += `\t\t\t\t<links>\n`;
        for (const cc of classConns) {
          const cId = connEaIdMap.get(cc.id)!;
          const s =
            cc.sourceNodeId ||
            cc.sourceId?.replace(/_(top|bottom|left|right)$/, '');
          const t =
            cc.targetNodeId ||
            cc.targetId?.replace(/_(top|bottom|left|right)$/, '');
          const sEaId = nodeEaIdMap.get(s)!;
          const tEaId = nodeEaIdMap.get(t)!;
          const relName =
            cc.type === 'generalization' ? 'Generalization' : 'Association';
          eaElementsXml += `\t\t\t\t\t<${relName} xmi:id="${cId}" start="${sEaId}" end="${tEaId}"/>\n`;
        }
        eaElementsXml += `\t\t\t\t</links>\n`;
      }

      eaElementsXml += `\t\t\t</element>\n`;

      // Elemento en <diagram><elements> (Coordenadas y dimensiones de la caja)
      const left = Math.max(20, Math.round(node.position?.x || 50));
      const top = Math.max(20, Math.round(node.position?.y || 50));
      const width = Math.max(160, Math.round(node.width || 220));
      const height = Math.max(
        80,
        Math.round(node.height || this.estimateNodeHeight(node)),
      );
      const right = left + width;
      const bottom = top + height;

      eaDiagramElementsXml += `\t\t\t\t\t<element geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" subject="${eaId}" seqno="${seqno}" style="DUID=${duid};"/>\n`;
      seqno++;
    }

    // Procesar Conexiones y Asociaciones
    for (const conn of validConnections) {
      const connEaId = connEaIdMap.get(conn.id)!;
      const sourceId =
        conn.sourceNodeId ||
        conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const targetId =
        conn.targetNodeId ||
        conn.targetId?.replace(/_(top|bottom|left|right)$/, '');
      const sourceEaId = nodeEaIdMap.get(sourceId)!;
      const targetEaId = nodeEaIdMap.get(targetId)!;
      const sourceDuid = nodeDuidMap.get(sourceId)!;
      const targetDuid = nodeDuidMap.get(targetId)!;

      const sourceNode = visibleNodes.find((n) => n.id === sourceId);
      const targetNode = visibleNodes.find((n) => n.id === targetId);
      const sName = sourceNode?.name || 'ClassSource';
      const tName = targetNode?.name || 'ClassTarget';

      const sMult = conn.sourceMultiplicity || '';
      const tMult = conn.targetMultiplicity || '';
      const connName = conn.name || '';
      const sRole = conn.sourceRole || '';
      const tRole = conn.targetRole || '';
      const toTarget =
        conn.navigability === 'to_target' || conn.navigability === 'both';
      const toSource =
        conn.navigability === 'to_source' || conn.navigability === 'both';
      const roleName = (role: string) =>
        role ? ` name="${this.escapeXml(role)}"` : '';

      const eaRelType = this.mapToEaRelationshipType(conn.type);
      const aggregationType =
        conn.type === 'composition'
          ? 'composite'
          : conn.type === 'aggregation'
            ? 'shared'
            : 'none';

      // 1. PackagedElement de Asociación en <uml:Model> (para associations, aggregations, compositions)
      if (conn.type !== 'generalization') {
        const dstPropId = `EAID_dst_${this.generateGuid().substring(0, 8)}`;
        const srcPropId = `EAID_src_${this.generateGuid().substring(0, 8)}`;

        umlPackagedElements += `\t\t\t<packagedElement xmi:type="uml:Association" xmi:id="${connEaId}" name="${this.escapeXml(connName)}" visibility="public">\n`;
        umlPackagedElements += `\t\t\t\t<memberEnd xmi:idref="${dstPropId}"/>\n`;
        // En UML un extremo es navegable si la asociación lo declara en navigableOwnedEnd
        if (toTarget) {
          umlPackagedElements += `\t\t\t\t<navigableOwnedEnd xmi:idref="${dstPropId}"/>\n`;
        }
        if (toSource) {
          umlPackagedElements += `\t\t\t\t<navigableOwnedEnd xmi:idref="${srcPropId}"/>\n`;
        }
        umlPackagedElements += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${dstPropId}"${roleName(tRole)} visibility="public" association="${connEaId}" aggregation="${aggregationType}">\n`;
        umlPackagedElements += `\t\t\t\t\t<type xmi:idref="${targetEaId}"/>\n`;
        if (tMult) {
          umlPackagedElements += this.buildMultiplicityXml(tMult);
        }
        umlPackagedElements += `\t\t\t\t</ownedEnd>\n`;

        umlPackagedElements += `\t\t\t\t<memberEnd xmi:idref="${srcPropId}"/>\n`;
        umlPackagedElements += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${srcPropId}"${roleName(sRole)} visibility="public" association="${connEaId}" aggregation="none">\n`;
        umlPackagedElements += `\t\t\t\t\t<type xmi:idref="${sourceEaId}"/>\n`;
        if (sMult) {
          umlPackagedElements += this.buildMultiplicityXml(sMult);
        }
        umlPackagedElements += `\t\t\t\t</ownedEnd>\n`;
        umlPackagedElements += `\t\t\t</packagedElement>\n`;
      }

      // 2. Conector en <xmi:Extension><connectors>
      eaConnectorsXml += `\t\t\t<connector xmi:idref="${connEaId}">\n`;
      eaConnectorsXml += `\t\t\t\t<source xmi:idref="${sourceEaId}">\n`;
      eaConnectorsXml += `\t\t\t\t\t<model type="Class" name="${this.escapeXml(sName)}"/>\n`;
      eaConnectorsXml += `\t\t\t\t\t<role${roleName(sRole)} visibility="Public" targetScope="instance"/>\n`;
      eaConnectorsXml += `\t\t\t\t\t<type ${sMult ? `multiplicity="${this.escapeXml(sMult)}"` : ''} aggregation="${aggregationType}" containment="Unspecified"/>\n`;
      eaConnectorsXml += `\t\t\t\t</source>\n`;
      eaConnectorsXml += `\t\t\t\t<target xmi:idref="${targetEaId}">\n`;
      eaConnectorsXml += `\t\t\t\t\t<model type="Class" name="${this.escapeXml(tName)}"/>\n`;
      eaConnectorsXml += `\t\t\t\t\t<role${roleName(tRole)} visibility="Public" targetScope="instance"/>\n`;
      eaConnectorsXml += `\t\t\t\t\t<type ${tMult ? `multiplicity="${this.escapeXml(tMult)}"` : ''} aggregation="none" containment="Unspecified"/>\n`;
      eaConnectorsXml += `\t\t\t\t</target>\n`;
      eaConnectorsXml += `\t\t\t\t<properties ea_type="${eaRelType}" direction="${this.escapeXml(EA_DIRECTIONS[conn.navigability || ''] || 'Unspecified')}"/>\n`;
      eaConnectorsXml += `\t\t\t\t<appearance linemode="${EA_DIRECT_LINE_MODE}" linecolor="-1" linewidth="0" seqno="0" headStyle="0" lineStyle="0"/>\n`;
      eaConnectorsXml += `\t\t\t\t<labels ${sMult ? `lb="${this.escapeXml(sMult)}"` : ''} ${tMult ? `rb="${this.escapeXml(tMult)}"` : ''} ${connName ? `mb="${this.escapeXml(connName)}"` : ''}/>\n`;
      eaConnectorsXml += `\t\t\t</connector>\n`;

      // 3. Conexión en <diagram><elements>
      eaDiagramElementsXml += `\t\t\t\t\t<element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=2;$LLB=;LLT=;LMT=;LMB=;LRT=;LRB=;IRHS=;ILHS=;Path=;" subject="${connEaId}" style="Mode=${EA_DIRECT_LINE_MODE};EOID=${targetDuid};SOID=${sourceDuid};Color=-1;LWidth=0;Hidden=0;"/>\n`;
    }

    // 4. ENSAMBLAR ARCHIVO XML XMI 2.1 COMPLETO
    let xml = `<?xml version="1.0" encoding="windows-1252"?>\n`;
    xml += `<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">\n`;
    xml += `\t<xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5" exporterID="1716"/>\n`;
    xml += `\t<uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">\n`;
    xml += `\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAPK_${pkgGuid}" name="${this.escapeXml(packageName)}" visibility="public">\n`;
    xml += umlPackagedElements;
    xml += `\t\t</packagedElement>\n`;
    xml += `\t</uml:Model>\n`;

    xml += `\t<xmi:Extension extender="Enterprise Architect" extenderID="6.5">\n`;
    xml += `\t\t<elements>\n`;
    xml += eaElementsXml;
    xml += `\t\t</elements>\n`;

    xml += `\t\t<connectors>\n`;
    xml += eaConnectorsXml;
    xml += `\t\t</connectors>\n`;

    xml += `\t\t<primitivetypes>\n`;
    xml += `\t\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAPrimitiveTypesPackage" name="EA_PrimitiveTypes_Package" visibility="public">\n`;
    xml += `\t\t\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAJavaTypesPackage" name="EA_Java_Types_Package" visibility="public">\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_uuid" name="uuid" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_String" name="String" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_int" name="int" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_long" name="long" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_boolean" name="boolean" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_double" name="double" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_float" name="float" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_Date" name="Date" visibility="public"/>\n`;
    xml += `\t\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_void" name="void" visibility="public"/>\n`;
    xml += `\t\t\t\t</packagedElement>\n`;
    xml += `\t\t\t</packagedElement>\n`;
    xml += `\t\t</primitivetypes>\n`;

    xml += `\t\t<profiles/>\n`;
    xml += `\t\t<diagrams>\n`;
    xml += `\t\t\t<diagram xmi:id="EAID_${diagramGuid}">\n`;
    xml += `\t\t\t\t<model package="EAPK_${pkgGuid}" localID="1" owner="EAPK_${pkgGuid}" tpos="0"/>\n`;
    xml += `\t\t\t\t<properties name="${this.escapeXml(packageName)}" type="Logical"/>\n`;
    xml += `\t\t\t\t<project author="UML Studio" version="1.0" created="${now}" modified="${now}"/>\n`;
    xml += `\t\t\t\t<style1 value="ShowPrivate=1;ShowProtected=1;ShowPublic=1;HideRelationships=0;Locked=0;Border=1;HighlightForeign=1;PackageContents=1;SequenceNotes=0;ScalePrintImage=0;PPgs.cx=1;PPgs.cy=1;DocSize.cx=826;DocSize.cy=1169;ShowDetails=0;Orientation=P;Zoom=100;ShowTags=0;OpParams=1;VisibleAttributeDetail=0;ShowOpRetType=1;ShowIcons=1;CollabNums=0;HideProps=0;ShowReqs=0;ShowCons=0;PaperSize=9;HideParents=0;UseAlias=0;HideAtts=0;HideOps=0;HideStereo=0;HideElemStereo=0;ShowTests=0;ShowMaint=0;ConnectorNotation=UML 2.1;ExplicitNavigability=0;ShowShape=1;AllDockable=0;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;m_bElementClassifier=1;SPT=1;ShowNotes=0;SuppressBrackets=0;SuppConnectorLabels=0;PrintPageHeadFoot=0;ShowAsList=0;"/>\n`;
    xml += `\t\t\t\t<style2 value="ExcludeRTF=0;DocAll=0;HideQuals=0;AttPkg=1;ShowTests=0;ShowMaint=0;SuppressFOC=1;MatrixActive=0;SwimlanesActive=1;KanbanActive=0;MatrixLineWidth=1;MatrixLineClr=0;MatrixLocked=0;TConnectorNotation=UML 2.1;TExplicitNavigability=0;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;m_bElementClassifier=1;SPT=1;MDGDgm=;STBLDgm=;ShowNotes=0;VisibleAttributeDetail=0;ShowOpRetType=1;SuppressBrackets=0;SuppConnectorLabels=0;PrintPageHeadFoot=0;ShowAsList=0;SuppressedCompartments=;Theme=:119;SaveTag=AD77BF90;"/>\n`;
    xml += `\t\t\t\t<swimlanes value="locked=false;orientation=0;width=0;inbar=false;names=false;color=-1;bold=false;fcol=0;tcol=-1;ofCol=-1;ufCol=-1;hl=0;ufh=0;hh=0;cls=0;bw=0;hli=0;bro=0;"/>\n`;
    xml += `\t\t\t\t<matrixitems value="locked=false;matrixactive=false;swimlanesactive=true;kanbanactive=false;width=1;clrLine=0;"/>\n`;
    xml += `\t\t\t\t<extendedProperties/>\n`;
    xml += `\t\t\t\t<elements>\n`;
    xml += eaDiagramElementsXml;
    xml += `\t\t\t\t</elements>\n`;
    xml += `\t\t\t</diagram>\n`;
    xml += `\t\t</diagrams>\n`;
    xml += `\t</xmi:Extension>\n`;
    xml += `</xmi:XMI>\n`;

    return xml;
  }

  private generateGuid(): string {
    const raw = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    return `${raw.substring(0, 8)}_${raw.substring(8, 12)}_${raw.substring(12, 16)}_${raw.substring(16, 20)}_${raw.substring(20, 32)}`;
  }

  private generateDuid(seed: string): string {
    const hash = crypto
      .createHash('md5')
      .update(seed || crypto.randomUUID())
      .digest('hex');
    return hash.substring(0, 8).toUpperCase();
  }

  private mapToEaRelationshipType(type: string): string {
    switch (type) {
      case 'generalization':
        return 'Generalization';
      case 'realization':
        return 'Realisation';
      case 'composition':
      case 'aggregation':
      case 'association':
      case 'association_class':
        return 'Association';
      case 'dependency':
        return 'Dependency';
      default:
        return 'Association';
    }
  }

  private getEaTypeReference(typeName: string): string {
    const lower = (typeName || '').toLowerCase().trim();
    if (lower.includes('uuid')) return 'EAJava_uuid';
    if (
      lower.includes('string') ||
      lower.includes('text') ||
      lower.includes('char')
    )
      return 'EAJava_String';
    if (
      lower.includes('int') ||
      lower.includes('short') ||
      lower.includes('byte')
    )
      return 'EAJava_int';
    if (lower.includes('long')) return 'EAJava_long';
    if (lower.includes('bool')) return 'EAJava_boolean';
    if (
      lower.includes('double') ||
      lower.includes('decimal') ||
      lower.includes('numeric')
    )
      return 'EAJava_double';
    if (lower.includes('float')) return 'EAJava_float';
    if (lower.includes('date') || lower.includes('time')) return 'EAJava_Date';
    if (lower.includes('void')) return 'EAJava_void';
    return 'EAJava_String';
  }

  private buildMultiplicityXml(multiplicity: string): string {
    const mult = multiplicity.trim();
    let lower = '1';
    let upper = '1';

    if (mult === '*' || mult === '0..*' || mult === '0..n') {
      lower = '0';
      upper = '-1';
    } else if (mult === '1..*' || mult === '1..n') {
      lower = '1';
      upper = '-1';
    } else if (mult === '0..1') {
      lower = '0';
      upper = '1';
    } else if (mult.includes('..')) {
      const parts = mult.split('..');
      lower = parts[0]?.trim() || '1';
      upper = parts[1]?.trim() === '*' ? '-1' : parts[1]?.trim() || '1';
    }

    let out = `\t\t\t\t\t<lowerValue xmi:type="uml:${upper === '-1' ? 'LiteralUnlimitedNatural' : 'LiteralInteger'}" xmi:id="EAID_L_${this.generateGuid().substring(0, 8)}" value="${lower}"/>\n`;
    out += `\t\t\t\t\t<upperValue xmi:type="uml:${upper === '-1' ? 'LiteralUnlimitedNatural' : 'LiteralInteger'}" xmi:id="EAID_U_${this.generateGuid().substring(0, 8)}" value="${upper}"/>\n`;
    return out;
  }

  private estimateNodeHeight(node: UmlNodeData): number {
    const attrCount = node.attributes?.length || 0;
    const methodCount = node.methods?.length || 0;
    return (
      36 + Math.max(1, attrCount) * 22 + Math.max(1, methodCount) * 22 + 16
    );
  }

  private escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private capitalize(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
