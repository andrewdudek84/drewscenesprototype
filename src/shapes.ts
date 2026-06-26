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

// Both PRIM_DRAG_MIME and ENTITY_INSTANCE_DRAG_MIME carry a list of ids so a
// single drop can reparent the entire multi-selection. Encoded as JSON to
// avoid ambiguity if an id ever contains a delimiter. Decode tolerates the
// legacy single-id format (a raw, non-JSON string) for safety.
export function encodeDragIds(ids: string[]): string {
  return JSON.stringify(ids);
}
export function decodeDragIds(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed;
    }
  } catch {
    // Legacy single-id payload — fall through.
  }
  return [raw];
}
