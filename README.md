# drewscenes

A browser-based, no-code 3D layout editor for placing primitives and external USD asset references on a metric grid, with full **USDA** import/export. Built as a working prototype for the **Spatial Layout Authoring** feature described in [`spatial-layout-feature-spec.md`](./spatial-layout-feature-spec.md).

The on-disk contract is USDA — a scene round-trips losslessly through `Export` → text file → `Import`.

---

## Quick start

Prerequisites: Node 18+ and npm.

```powershell
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Other scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc -b --noEmit` only |

## Tech stack

- **React 18** + **TypeScript 5** + **Vite 5**
- **Babylon.js 7** — `@babylonjs/core` viewport, `@babylonjs/materials` (grid), `@babylonjs/loaders` (glTF + OBJ)
- Custom Vite plugin (`vite.config.ts`) serves `usd_assets/` at `/usd_assets/*` in dev and copies it into `dist/usd_assets/` on build

## Workspace tour

```
src/
  App.tsx                  // top-level state, USDA round-trip, hotkeys
  types.ts                 // ShapeKind, PrimNode, ToolMode, Vec3, …
  shapes.ts                // SHAPE_CATALOG, drag MIME types
  assets.ts                // import.meta.glob over usd_assets/*.usda
  usd.ts                   // parseUsda / exportToUsda
  components/
    TopBar.tsx             // logo, scene name, Import/Export, settings
    LeftToolbar.tsx        // Select / Move / Rotate / Scale / Measure / Focus
    Viewport.tsx           // Babylon scene, gizmos, picking, measure tool
    HierarchyPanel.tsx     // parent/child tree + reparent drag + delete
    PropertiesPanel.tsx    // edit name / transform / color / source
    BottomPanel.tsx        // tabs: Shapes + Assets
    ShapesPalette.tsx
    AssetsPalette.tsx
    CameraControls.tsx     // Top/Bottom/Front/Back/Left/Right/Perspective
usd_assets/                // bundled USDA + GLB/OBJ payloads
  stairs.usda
  Forklift/  Forklift.usd  textures/
  shelves_01.usda  shelves_01.glb
  HospitalBed/  Hospital_Bed.obj  …
spatial-layout-feature-spec.md
```

## Features

### Authoring

- **Shapes palette**: group, box, cylinder, sphere, cone, plane. Drag onto the viewport, a hierarchy row, or the Scene root.
- **Assets palette**: bundled USDA assets — Forklift (GLB + PBR), shelves_01 (GLB), Hospital Bed (OBJ + MTL + textures), stairs (primitives).
- **Hierarchy panel**: parent/child tree, drag-to-reparent (preserves world transform, cycle-checked), per-row trash icon with cascade delete.
- **Properties panel**: editable name, position (m), rotation (deg), color (primitives), `assetInfo:source` path (references).

### Viewport

- `ArcRotateCamera` — left drag orbits, right drag pans, wheel zooms; radius clamped `[1, 5000]`.
- Default view: 3/4 perspective at `(α=π/4, β=π/3, r=25)` targeting the origin.
- 10,000 × 10,000 m ground on X–Z with `GridMaterial`: 1 m minor, 10 m major.
- Origin axis indicators: **X red, Y green, Z blue** (2 m each).
- Lighting: hemispheric fill (white above, cool below) + warm directional key.
- Camera-view overlay (top-right): Top / Bottom / Front / Back / Left / Right snap to orthographic; Perspective returns to the default angle.

### Tools

| Tool | Hotkey | Behavior |
|---|---|---|
| Select | — | Click in viewport or hierarchy |
| Move | — | Babylon position gizmo, snap **1 m** |
| Rotate | — | World-axis rotation gizmo, snap **5°** |
| Scale | — | Scale gizmo, snap **0.25** |
| **Measure** | **M** | Click two points to measure in meters |
| **Focus** | **F** | Reset camera to default view |

The Measure tool drops a yellow start marker on first click, shows a live dashed line + `X.XX m` label that follows the cursor, and commits the end marker on second click. Picking snaps to the nearest bounding-box corner of the mesh under the cursor (within 0.5 m), otherwise to the raw surface point or the floor.

### USDA round-trip

- **Export** writes the current scene to a `.usda` file (hierarchy, kind, transforms, color, `assetInfo:source` for references).
- **Import** parses a `.usda` file and replaces the scene; `kind = 'reference'` is inferred from `assetInfo:source` on Xform prims.
- The in-memory model is rebuilt from the file on import — USDA is the contract.

### Theme

- Light (default) / Dark, toggled from the settings menu in the top right; persisted in `localStorage` (`drewscenes:theme`).

## Authoring USDA assets

Bundled assets live in `usd_assets/` and are discovered automatically by `import.meta.glob('../usd_assets/*.usda', { query: '?raw' })`. To add one:

1. Drop a payload (`.glb`, `.obj` + `.mtl` + textures) into `usd_assets/MyAsset/`.
2. Add `usd_assets/MyAsset.usda` with a wrapping Xform that references the payload:

   ```usda
   #usda 1.0
   (
     defaultPrim = "MyAsset"
     metersPerUnit = 1
     upAxis = "Y"
   )

   def Xform "MyAsset" (
     kind = "reference"
   )
   {
     custom asset assetInfo:source = @./MyAsset/MyAsset.glb@
     # Unit conversion lives here. Inches → meters:
     # double3 xformOp:scale = (0.0254, 0.0254, 0.0254)
     # uniform token[] xformOpOrder = ["xformOp:scale"]
   }
   ```

3. Optionally add a label override in `src/assets.ts` (`LABEL_OVERRIDES`) and an SVG icon in [`AssetsPalette.tsx`](./src/components/AssetsPalette.tsx).
4. Refresh — the asset shows up in the bottom panel's **Assets** tab.

### Format notes

- **GLB** is the smoothest path (Forklift, shelves) — PBR materials and textures Just Work.
- **OBJ** is supported but the loader defaults are tuned in `Viewport.tsx` (`OPTIMIZE_WITH_UV = false`, `COMPUTE_NORMALS = true`, `OPTIMIZE_NORMALS = true`) to survive dense exports. Loaded materials are sanitized: back-face culling off, transparency forced opaque, alpha 1 — this avoids stray translucency from PNG diffuse alpha channels.
- The `metersPerUnit` declaration is documentation; actual unit conversion is the `xformOp:scale` on the wrapping Xform.

## Static asset serving

`vite.config.ts` registers a small plugin that:

- In dev, intercepts `/usd_assets/*` requests with the right `Content-Type`, but **skips URLs with a query string** (e.g. `?raw`, `?import`) so Vite's own module pipeline still handles `import.meta.glob`.
- On build, recursively copies `usd_assets/` to `dist/usd_assets/`, preserving filenames so OBJ → MTL → texture relative paths resolve in production.

## Not yet implemented (vs. the spec)

See section 15.10 of [`spatial-layout-feature-spec.md`](./spatial-layout-feature-spec.md) for the full list. Highlights:

- Entity types vs. instances (everything is a single "prim" today; `reference` prims are a step toward type-default geometry).
- Multi-select, copy, distribute, mirror, undo/redo.
- Snap to floor / walls; configurable units (units are fixed at meters).
- Server-side persistence — closing the tab loses anything not exported as USDA.
- Decomposition, ontology composition, Fabric item wiring.

## License

Prototype code. No license file — treat as proprietary unless stated otherwise.
