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
  /** For `kind === 'group'` spawned from the asset library: the library id
   *  (e.g. "HospitalBed"). Lets the UI map the group back to its source
   *  `/usd_assets/<id>.usda` wrapper — used by the ontology drop binding. */
  assetId?: string;
  /** User-authored extra key/value properties shown in the Properties panel. */
  customProps?: Record<string, string>;
  color: string;
}

export interface PrimTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export type PrimPatch = Partial<
  Pick<
    PrimNode,
    'name' | 'position' | 'rotation' | 'scale' | 'color' | 'parentId' | 'assetSource' | 'customProps'
  >
>;

/**
 * Read-only descriptor for one node/mesh inside a loaded reference asset
 * (GLB/OBJ). Lets the Hierarchy panel display the asset's internal structure
 * and let the user select individual sub-meshes in the viewport.
 *
 * `uid` is stable for the lifetime of the loaded asset instance and matches
 * the picked Babylon mesh, so it's safe to use as the selection key.
 */
export interface AssetMeshNode {
  uid: string;
  name: string;
  children: AssetMeshNode[];
}

/**
 * Live pose data for a selected sub-mesh inside a loaded reference asset.
 * Read-only in the UI (the gizmo always drives the parent prim, not an
 * asset-internal node), but lets the Properties panel display the picked
 * node's name and local transform.
 *
 * Rotation values are Euler angles in radians, matching `PrimNode.rotation`.
 */
export interface SubMeshInfo {
  uid: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
}
