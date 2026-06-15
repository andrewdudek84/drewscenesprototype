// Library of bundled USD assets. The USDA text is inlined at build time so the
// app stays a single static bundle. Binary payloads (GLB / OBJ + MTL + textures)
// are served verbatim from /usd_assets/ by a small Vite plugin so that relative
// references (e.g. an MTL's `map_Kd textures/foo.png`) resolve naturally.

const assetModules = import.meta.glob('../usd_assets/*.usda', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export interface AssetDef {
  id: string;
  label: string;
  usda: string;
}

const LABEL_OVERRIDES: Record<string, string> = {
  stairs: 'Stairs',
  Forklift: 'Forklift',
  shelves_01: 'Shelves',
  HospitalBed: 'Hospital Bed'
};

export const ASSET_LIBRARY: AssetDef[] = Object.entries(assetModules)
  .map(([path, usda]) => {
    const base = path.split('/').pop() ?? 'asset.usda';
    const id = base.replace(/\.usda?$/i, '');
    const label = LABEL_OVERRIDES[id] ?? titleCase(id);
    return { id, label, usda };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export function getAsset(id: string): AssetDef | undefined {
  return ASSET_LIBRARY.find((a) => a.id === id);
}

/**
 * Resolve a USDA asset path (the contents of `@...@`) to a URL the browser
 * can fetch. Accepts paths like "./Forklift/Forklift.glb" or
 * "HospitalBed/Hospital_Bed.obj"; returns a stable `/usd_assets/...` URL.
 */
export function resolveAssetUrl(assetPath: string): string {
  const cleaned = assetPath.replace(/^\.\//, '').replace(/^\/+/, '');
  return `/usd_assets/${cleaned}`;
}

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
