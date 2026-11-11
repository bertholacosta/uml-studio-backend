/** Forma del diagrama que intercambian el editor y Trazo. */
export interface UmlClassNode {
  id: string;
  name: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  isAnchor?: boolean;
  assocAnchorNodeId?: string;
  assocMainConnId?: string;
  attributes: { name: string; type: string; visibility?: string }[];
  methods: {
    name: string;
    parameters: string;
    returnType: string;
    visibility?: string;
  }[];
}

export interface UmlConnection {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceId: string;
  targetId: string;
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
