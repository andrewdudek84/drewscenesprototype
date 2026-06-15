// In-memory model of a placed prim. Stands in for what will later be a
// per-instance USD asset entry in the Spatial Layout ontology.

export type ShapeKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'plane'
  | 'cone'
  | 'group'
  | 'reference';

export type ToolMode = 'select' | 'move' | 'rotate' | 'scale' | 'measure';

export type Vec3 = [number, number, number];

export interface PrimNode {
  id: string;
  name: string;
  kind: ShapeKind;
  /** Position in the parent's local frame (world frame when parentId is null). */
  position: Vec3;
  /** Euler angles in radians, in the parent's local frame. */
  rotation: Vec3;
  scale: Vec3;
  parentId: string | null;
  /** CSS-style hex color, e.g. "#b3b3b8". */
  /** For `kind === 'reference'`: USDA asset path (e.g. "./Forklift/Forklift.glb"). */
  assetSource?: string;
  color: string;
}

export interface PrimTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export type PrimPatch = Partial<
  Pick<PrimNode, 'name' | 'position' | 'rotation' | 'scale' | 'color' | 'parentId' | 'assetSource'>
>;
