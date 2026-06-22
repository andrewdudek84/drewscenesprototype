import type { ShapeKind } from './types';

export interface ShapeDef {
  kind: ShapeKind;
  label: string;
}

export const SHAPE_CATALOG: ShapeDef[] = [
  { kind: 'box', label: 'Box' },
  { kind: 'cylinder', label: 'Cylinder' },
  { kind: 'sphere', label: 'Sphere' },
  { kind: 'cone', label: 'Cone' },
  { kind: 'plane', label: 'Plane' }
];

export const SHAPE_DRAG_MIME = 'application/x-drewscenes-shape';
export const PRIM_DRAG_MIME = 'application/x-drewscenes-prim';
export const ASSET_DRAG_MIME = 'application/x-drewscenes-asset';
