// Library of bundled USD assets. The USDA text is inlined at build time so the
// app stays a single static bundle. Binary payloads (GLB / OBJ + MTL + textures)
// are served verbatim from /usd_assets/ by a small Vite plugin so that relative
// references (e.g. an MTL's `map_Kd textures/foo.png`) resolve naturally.

import { getUserLibraryItem, resolveUserAssetUrl } from './userLibrary';

const assetModules = import.meta.glob('../usd_assets/*.usda', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

// Only show assets whose binary payloads were actually shipped in the build.
// In dev (allowlist empty) we expose everything; in prod we filter to match
// vite.config.ts's DIST_ASSET_ALLOWLIST so the palette never advertises an
// asset whose binary parts (GLB / OBJ / textures) weren't deployed.
const ALLOWLIST = (typeof __DIST_ASSET_ALLOWLIST__ !== 'undefined'
  ? __DIST_ASSET_ALLOWLIST__
  : []) as string[];

// Curated set of asset ids actually exposed in the deployment palette.
const DEPLOYABLE_ASSET_IDS = new Set(['HospitalBed', 'Room', 'Placeholder']);

export interface AssetDef {
  id: string;
  label: string;
  usda: string;
}

const LABEL_OVERRIDES: Record<string, string> = {
  stairs: 'Stairs',
  shelves_01: 'Shelves',
  HospitalBed: 'Hospital Bed',
  Room: 'Room',
  UR10: 'UR10',
  Placeholder: 'Placeholder'
};

export const ASSET_LIBRARY: AssetDef[] = Object.entries(assetModules)
  .map(([path, usda]) => {
    const base = path.split('/').pop() ?? 'asset.usda';
    const id = base.replace(/\.usda?$/i, '');
    const label = LABEL_OVERRIDES[id] ?? titleCase(id);
    return { id, label, usda };
  })
  .filter((a) => DEPLOYABLE_ASSET_IDS.has(a.id))
  .filter((a) => ALLOWLIST.length === 0 || ALLOWLIST.includes(a.id))
  .sort((a, b) => a.label.localeCompare(b.label));

export function getAsset(id: string): AssetDef | undefined {
  const builtin = ASSET_LIBRARY.find((a) => a.id === id);
  if (builtin) return builtin;
  const user = getUserLibraryItem(id);
  if (user) return { id: user.id, label: user.label, usda: user.usda };
  return undefined;
}

/**
 * Resolve a USDA asset path (the contents of `@...@`) to a URL the browser
 * can fetch. Accepts paths like "./Forklift/Forklift.glb" or
 * "HospitalBed/Hospital_Bed.obj"; returns a stable `/usd_assets/...` URL.
 * Paths starting with `user://` are resolved against the in-memory user
 * library blob registry (object URLs created from IndexedDB-backed Blobs).
 */
export function resolveAssetUrl(assetPath: string): string {
  if (assetPath.startsWith('user://')) {
    const url = resolveUserAssetUrl(assetPath);
    if (url) return url;
  }
  const cleaned = assetPath.replace(/^\.\//, '').replace(/^\/+/, '');
  return `/usd_assets/${cleaned}`;
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
