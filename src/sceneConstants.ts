import type { ShapeKind } from './types';

export const KIND_LABELS: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  plane: 'Plane',
  cone: 'Cone',
  // 'group' prims are surfaced as "Asset" containers in the UI (the
  // underlying ShapeKind string stays 'group' so USDA export/import is
  // unaffected).
  group: 'Asset',
  reference: 'Reference'
};

// Default half-height to lift the spawned mesh so it rests on the ground.
export const SPAWN_HALF_HEIGHT: Record<ShapeKind, number> = {
  box: 0.5,
  cylinder: 0.5,
  sphere: 0.5,
  plane: 0.001,
  cone: 0.5,
  group: 0,
  // Reference prims carry their own pivot inside the GLB; don't add a lift.
  reference: 0
};

export const DEFAULT_COLOR = '#b3b3b8';

// Maps primitive shape kinds to the matching `usd_shapes/<Name>.usda` wrapper
// so a plain Box / Cylinder / etc. can be drag-bound to an ontology
// SpatialItem the same way library Assets are.
export const SHAPE_USDA: Partial<Record<ShapeKind, string>> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  plane: 'Plane'
};
