# drewscenes

A browser-based, no-code 3D layout editor for placing primitives and external USD asset references on a metric grid, with an ontology layer (entity types, instances, and `HasChild` / `HasUSD` relationships) bound to viewport prims. Built as a working prototype for the **Spatial Layout Authoring** feature described in [spatial-layout-feature-spec.md](spatial-layout-feature-spec.md).

The on-disk contract is a JSON envelope `{ Scene: <usda-text>, Ontology: <doc> }` — a scene round-trips losslessly through **Save** → JSON file → **Load**.

---

## Quick start

Prerequisites: Node 18+ and npm.

```powershell
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc -b --noEmit` only |

## Tech stack

- **React 18** + **TypeScript 5** + **Vite 5**
- **Babylon.js 7** — `@babylonjs/core` viewport, `@babylonjs/materials` (grid), `@babylonjs/loaders` (glTF + OBJ)
- **IndexedDB** for per-browser user-imported library items
- Custom Vite plugin ([vite.config.ts](vite.config.ts)) serves `usd_assets/` at `/usd_assets/*` in dev and copies the `DIST_ASSET_ALLOWLIST` subset into `dist/usd_assets/` on build

## Workspace tour

```
src/
  App.tsx                  // top-level state, save/load envelope, hotkeys
  sceneConstants.ts        // KIND_LABELS, SPAWN_HALF_HEIGHT, DEFAULT_COLOR, SHAPE_USDA
  sceneUtils.ts            // fileSafe, randomSceneName, nextDuplicateName, matrix helpers
  types.ts                 // ShapeKind, PrimNode, ToolMode, Vec3, AssetMeshNode, …
  shapes.ts                // SHAPE_CATALOG, drag MIME types
  assets.ts                // bundled USDA + user-library lookup (getAsset)
  usd.ts                   // parseUsda / exportToUsda (drewscenes:id round-trip)
  userLibrary.ts           // IndexedDB persistence, blob -> object-URL registry
  assetIcon.ts             // keyword icon picker + Blank fallback
  ontology.ts              // OntologyDoc types, mutations, binding helpers
  components/
    TopBar.tsx             // scene name (inline edit), Save, Load, settings (theme)
    LeftToolbar.tsx        // Select/Move/Rotate/Scale, snap toggle, Viewport-panel toggle
    Viewport.tsx           // Babylon scene, gizmos, picking, measure, focus
    HierarchyPanel.tsx     // "Viewport" slide-out: prim tree + reparent + delete
    PropertiesPanel.tsx    // floating overlay: edits selected prim / entity
    BottomPanel.tsx        // tabs: Shapes + Assets (both with Import tile)
    ShapesPalette.tsx
    AssetsPalette.tsx
    PaletteImporter.tsx    // import .usda/.usd/.glb/.gltf/.obj into IndexedDB
    OntologyPanel.tsx      // instance tree with right-click + drag-bind
    EntityModelsPanel.tsx  // entity-type DAG (HasChild / HasUSD model edges)
    ContextMenu.tsx        // right-click duplicate / delete
    InlineNameEdit.tsx     // shared rename-in-place input
    CameraControls.tsx     // Top/Bottom/Front/Back/Left/Right/Perspective
onotologies/
  hospital.json            // bundled ontology shipped as the startup default
usd_assets/                // bundled USDA wrappers + GLB/OBJ payloads
  Forklift.usda  Forklift/Forklift.usd
  HospitalBed.usda  HospitalBed/Hospital_Bed.{obj,mtl,textures/}
  ISS.usda  ISS/
  PackingLine.usda  PackingLine/
  Room.usda
  UR10.usda  UR10/obj_arm.mtl
  shelves_01.usda  shelves_01.glb
  stairs.usda
usd_shapes/                // primitive USDA stand-ins (Box, Cone, Cylinder, Plane, Sphere)
spatial-layout-feature-spec.md
```

## Features

### Authoring

- **Shapes palette** ([ShapesPalette.tsx](src/components/ShapesPalette.tsx)): box, cylinder, sphere, cone, plane. Drag onto the viewport, a hierarchy row, or the Viewport-panel root.
- **Assets palette** ([AssetsPalette.tsx](src/components/AssetsPalette.tsx)): bundled USDA assets — Hospital Bed (OBJ + MTL + textures), Room, etc. — plus a Blank/Group container. The `DIST_ASSET_ALLOWLIST` controls what ships to production; dev exposes every `usd_assets/*.usda`.
- **Import tile** ([PaletteImporter.tsx](src/components/PaletteImporter.tsx)): both palettes' first tile is an **Import** button (dashed light-blue). Accepts `.usda`, `.usd`, `.glb`, `.gltf`, `.obj`. Items persist per-browser in IndexedDB and appear with a hover-revealed `×` to remove.
  - `.usda` / `.usd` (text): stored verbatim and parsed at spawn time.
  - `.glb` / `.gltf` / `.obj`: file is stored as a `Blob`, a synthetic USDA wrapper is generated that references it as `@user://<itemId>/<filename>@`, and a runtime registry maps that path to a `blob:` object URL.
  - Binary `.usd` (Crate format) is rejected with a friendly alert — convert to `.usda` first.
- **Hierarchy** ([HierarchyPanel.tsx](src/components/HierarchyPanel.tsx), header "Viewport"): right-side slide-out toggled from the left toolbar. Parent/child tree, drag-to-reparent (preserves world transform, cycle-checked), per-row trash with cascade delete, right-click duplicate / delete.
- **Properties** ([PropertiesPanel.tsx](src/components/PropertiesPanel.tsx)): floating overlay; edits the selected prim's name, position (m), rotation (°), scale, color (primitives), `assetInfo:source` (references), and custom key/value props. Switches to entity-instance / entity-type editing when the selection lives in an ontology panel.

### Ontology

- **EntityModelsPanel** ([EntityModelsPanel.tsx](src/components/EntityModelsPanel.tsx)): entity-type schema as a DAG. Drag a type onto another to add an additional `HasChild` parent edge (a type can have multiple parents). Manage `HasUSD` model edges that wire a parent type to its USD child type.
- **OntologyPanel** ([OntologyPanel.tsx](src/components/OntologyPanel.tsx)): entity-instance tree. Drag assets onto entities to bind a prim to the entity's `usd` / `guid` fields; drag-reparent; right-click context menu.
- **Bindings**: a `SpatialBinding = { guid, usd, name }` maps `entity.id → prim.id`. The viewport prim's `drewscenes:id` round-trips through USDA so bindings reattach on import.
- **Bundled ontology**: [onotologies/hospital.json](onotologies/hospital.json) loads at startup.

### Save / Load

- **Save** (`handleExport` in [App.tsx](src/App.tsx)): writes a JSON envelope `{ Scene: <usda text>, Ontology: <doc> }` to `<sceneName>.json`.
  - The ontology branch first runs `applyBindingsToOntology` (writes each entity's live `guid`, `usd`, and pose) then `ensureHasUsdEdges` (adds any missing `HasUSD` relationships by walking each bound prim up to its nearest bound ancestor).
- **Load** (`handleImport` in [App.tsx](src/App.tsx)): accepts both the JSON envelope and a legacy `.usda`. On load, prims are parsed from `Scene`, and bindings are reattached by matching `Ontology.instances.entities[*].guid` against the parsed `prim.id`.

### Viewport ([Viewport.tsx](src/components/Viewport.tsx))

- `ArcRotateCamera` — left drag orbits, right drag pans, wheel zooms; radius clamped `[1, 5000]`.
- Default view: 3/4 perspective at `(α=π/4, β=π/3, r=25)` targeting the origin.
- 10,000 × 10,000 m ground on X–Z with `GridMaterial`: 1 m minor, 10 m major.
- Origin axis indicators: **X red, Y green, Z blue** (2 m each).
- Lighting: hemispheric fill (white above, cool below) + warm directional key.
- Camera-view overlay ([CameraControls.tsx](src/components/CameraControls.tsx), top-right): Top / Bottom / Front / Back / Left / Right snap to orthographic; Perspective returns to the default angle.

### Tools

| Tool | Hotkey | Behavior |
|---|---|---|
| Select | — | Click in viewport or hierarchy |
| Move | — | Babylon position gizmo, snap **1 m** (when snap on) |
| Rotate | — | World-axis rotation gizmo, snap **5°** |
| Scale | — | Scale gizmo, snap **0.25** |
| **Measure** | **M** | Click two points to measure in meters |
| **Focus** | **F** | Reset camera to default view |

Snap can be toggled globally from the left toolbar. The Measure tool drops a yellow start marker on first click, shows a live dashed line + `X.XX m` label that follows the cursor, and commits the end marker on second click. Picking snaps to the nearest bounding-box corner of the mesh under the cursor (within 0.5 m), otherwise to the raw surface point or the floor.

Hotkeys are ignored while a text input, textarea, select, or contenteditable element has focus.

### Theme

- **Light (default)** / Dark, toggled from the settings (hamburger) menu in the top right; persisted in `localStorage` (`drewscenes:theme`) and applied via the `<html data-theme="…">` attribute.

## Authoring USDA assets (bundled)

Bundled assets live in `usd_assets/` and are discovered at build time by `import.meta.glob('../usd_assets/*.usda', { query: '?raw' })`. To add one:

1. Drop a payload (`.glb`, `.obj` + `.mtl` + textures) into `usd_assets/MyAsset/`.
2. Add `usd_assets/MyAsset.usda`:

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

3. Add the id to `DEPLOYABLE_ASSET_IDS` in [src/assets.ts](src/assets.ts) (and `DIST_ASSET_ALLOWLIST` in [vite.config.ts](vite.config.ts)) if it should ship to production. Optionally add a label override in `LABEL_OVERRIDES` and an SVG icon in [AssetsPalette.tsx](src/components/AssetsPalette.tsx).
4. Refresh — the asset shows up in the **Assets** tab.

For one-off user imports, prefer the in-app **Import** tile — that path doesn't require a rebuild and is per-browser (IndexedDB).

### Format notes

- **GLB** is the smoothest path (self-contained — geometry + PBR materials + textures in one file).
- **OBJ** is supported but the loader defaults are tuned in [Viewport.tsx](src/components/Viewport.tsx) (`OPTIMIZE_WITH_UV = false`, `COMPUTE_NORMALS = true`, `OPTIMIZE_NORMALS = true`) to survive dense exports. Loaded materials are sanitized: back-face culling off, transparency forced opaque, alpha 1 — this avoids stray translucency from PNG diffuse alpha channels.
- **glTF** with separate `.bin` / textures and **OBJ** with separate `.mtl` are best used as bundled assets; the in-app importer stores only the single file you pick, so companion files will 404. Use `.glb` for self-contained user imports.
- `metersPerUnit` is documentation; actual unit conversion is the `xformOp:scale` on the wrapping Xform.

## Static asset serving

[vite.config.ts](vite.config.ts) registers a small plugin that:

- In dev, intercepts `/usd_assets/*` requests with the right `Content-Type`, but **skips URLs with a query string** (e.g. `?raw`, `?import`) so Vite's own module pipeline still handles `import.meta.glob`.
- On build, recursively copies the assets named in `DIST_ASSET_ALLOWLIST` to `dist/usd_assets/`, preserving filenames so OBJ → MTL → texture relative paths resolve in production.

## Persistence summary

| Data | Where it lives |
|---|---|
| Current scene | React state (App.tsx) — lost on tab close unless **Save**'d |
| Saved scenes | `<sceneName>.json` envelope on the user's disk |
| Bundled assets | `usd_assets/` (build-time bundled) |
| User-imported library items | IndexedDB (`drewscenes` db, `userLibrary` store) per browser |
| Theme preference | `localStorage` key `drewscenes:theme` |

## Not yet implemented (vs. the spec)

See [spatial-layout-feature-spec.md](spatial-layout-feature-spec.md) §15.10 for the full list. Highlights:

- Multi-select, distribute, mirror, undo/redo.
- Snap to floor / walls; configurable units (units are fixed at meters).
- Server-side persistence for saved scenes (today: file-on-disk download + IndexedDB per browser).
- Binary `.usd` (Crate) import — only USDA-text and standalone GLB/GLTF/OBJ are accepted.
- Fabric item wiring.

## License

Prototype code. No license file — treat as proprietary unless stated otherwise.
