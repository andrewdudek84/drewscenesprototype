# Feature Spec: Spatial Layout Authoring

| | |
|---|---|
| **Status** | Draft |
| **Target release** | Ignite 2026 (MVP) |
| **Source document** | Spatial Layout Authoring 2026.06.12.docx |
| **Owning surface** | Microsoft Fabric — Spatial Intelligence |
| **Related items** | Ontology item, Lakehouse item, Physical Space item |

---

## 1. Summary

Spatial Layout is a new first-class Fabric item that lets a customer lay out a single physical environment (warehouse, factory, substation, etc.) by placing entity instances in a 3D space — with no code, no separate application, and no hand-authored USD. The output is a governed, narrowly-scoped ontology, its backing tables, and USD geometry assets, all live and renderable in the Physical Space item.

The item is the top of the funnel for spatial intelligence on Fabric. Its purpose is to remove the "we have no 3D model" barrier so customers can reach a useful spatial view in minutes (the "5x5" goal: a working spatial view from a standing start in five minutes by a user with five minutes of training), and then raise fidelity asset-by-asset on their own timeline.

## 2. Goals and non-goals

### 2.1 Goals

- **Time to first value.** A new user produces a working, renderable spatial view in minutes.
- **No-code authoring.** All authoring is visual; no USD, SQL, or ontology DSL is required.
- **Governed output.** Every artifact Spatial Layout writes (ontology, tables, USD assets) is owned by the item and safe to round-trip.
- **Composable.** Output is designed to compose with the enterprise ontology and manufacturer ontologies via shared identity, with no copying or rewriting.
- **Progressive fidelity.** Placeholder geometry can be replaced by higher-fidelity USD per type or per instance without breaking prior work.
- **Static-asset focused.** Optimized for assets whose position is authored once (shelves, racks, walls, fixed equipment).

### 2.2 Non-goals

- **General ontology editing.** Non-spatial properties, relationships, and bindings stay in the Ontology item.
- **Live data binding.** Streaming/telemetry stays in the Ontology and Physical Space items.
- **Real-time rendering against live data.** That belongs to the Physical Space item.
- **CAD-grade modeling.** Spatial Layout is not a CAD tool. High-precision geometry is imported as USD.
- **Authoring moving assets' live position.** Forklifts, pallets, etc. get a placeholder; live position comes from other items.
- **Writing into customer-owned schemas.** Spatial Layout only writes to tables it creates and owns.

## 3. Personas and primary use cases

| Persona | Need | How Spatial Layout helps |
|---|---|---|
| Operations lead with no 3D model | Stand up a spatial view of a warehouse fast | Build from SimReady placeholders on a no-code canvas |
| Solutions engineer in pre-sales | Show a working spatial demo from a customer floor plan | Quick decomposition of a single floor plan or simple USD |
| Spatial author at a customer with growing fidelity | Replace placeholder shelves with vendor-supplied USD | Per-type and per-instance geometry overrides |
| Customer with an existing CAD/BIM export | Convert a monolithic USD into entities and instances | Decomposition mode (advanced) |

## 4. Conceptual model

Spatial Layout generates and owns three things:

1. **An ontology** consisting of:
   - **Entity types**, each with a `geometry` property pointing at a USD asset (set as a type default so identical instances share one mesh). An optional per-instance table binding allows overrides.
   - **Containment relationship types** that connect two entity types and carry the child's position and orientation **relative to the parent**.
2. **Tables** holding instance rows, containment rows, and any per-instance geometry overrides. Property values are bound to these tables.
3. **USD assets** holding the geometry referenced by the type defaults and instance overrides.

The interactive 3D scene is **composed on demand** from these artifacts and discarded when the session ends. There is no saved monolithic scene; the ontology, tables, and USD assets are the single source of truth.

### 4.1 Composition with other ontologies

- **Enterprise ontology** — business properties, relationships, telemetry, owned by the customer.
- **Manufacturer ontology** — defines an asset and its sub-components, no spatial information.
- **Spatial Layout ontology** — where things sit and what they look like.

Entities match across ontologies by shared identity (entity instance ID). Spatial Layout writes only its own ontology; nothing is copied. This design assumes the Fabric ontology composition feature.

## 5. User experience

### 5.1 Workspace layout

- **Navigation pane** — lists entity types and, under each, their instances. Selecting a type or an instance sets the **editing context**. New types and instances are created here.
- **Shapes palette** (always visible) — basic geometry (boxes, cylinders, planes), SimReady library assets, imported USD assets. A shape drop edits geometry only; it has no meaning at the ontology level.
- **Entities palette** (active only when an instance is selected) — lists the entity types that the selected instance can contain. An entity drop creates a tracked instance with its own containment relationship and placement relative to the parent.
- **Viewport** — 3D by default, with a 2D top-down view available. Transform handles for position, rotation, and scale.

The two palettes' meanings never blur: shapes are geometry; entities are tracked instances.

### 5.2 Editing context — type vs. instance

| Context | What the user can do |
|---|---|
| **Type selected** | Author the type's default geometry by dropping/arranging shapes. Declare containment by creating a containment relationship type to another entity type (existing or new). A contained type must have geometry before its instances can be placed — a newly created contained type is given default geometry before proceeding. |
| **Instance selected** | All type-level actions, plus: override the instance's geometry (or revert to the type default), and place child entity instances from the Entities palette. Placing a child requires picking a type, then either choosing an existing instance from a data-backed list or entering a new ID. The drop records the child's position and orientation relative to the parent. |

An ID that matches one in the enterprise's data lets that instance pick up live data and business context later through composition. Moving assets get a placeholder position; live position is supplied later by other items.

The user can **promote an instance's geometry to become the type's default**, replacing whatever was there.

### 5.3 Viewport features

- 3D and 2D top-down views.
- Snapping to floor, walls, and grid.
- Configurable units; distance measurement in the viewport.
- Multi-select, copy, even distribution, rotation, mirroring (for rows of shelves, banks of equipment, etc.).
- Undo / redo across all actions.
- Named camera positions for quick return to key views.
- Rendering tuned for layout clarity, not visual fidelity.

### 5.4 Accessibility

- Keyboard navigation across navigation pane, palettes, and viewport.
- Screen-reader labels on palette items, scene objects, and navigation pane entries.
- UI chrome meets contrast requirements.

### 5.5 Session semantics

- Saving the layout materializes the work into the underlying ontology, tables, and USD assets.
- An abandoned session writes nothing.

## 6. Decomposition (advanced)

For customers who already have their environment as a single USD file (typically exported from CAD or BIM). Rather than building from scratch, they import the file into an instance and progressively re-attribute portions of its geometry to child entity instances or to type defaults.

### 6.1 Flow

1. Select or create an entity instance (e.g., `Warehouse 10`).
2. Import the USD file into it. All geometry is initially attributed to that instance.
3. In the viewport, select portions of geometry and **promote** each selection:
   - **Promote to instance** — pick or create an entity type, assign an ID; the selected geometry becomes that instance's USD asset; its position is expressed relative to its parent.
   - **Promote to type default** — efficient path for repeated assets. Select one rack, define it as the `Shelf` type's default, then select all matching racks and assign them as `Shelf` instances sharing that geometry. Spatial Layout detects exact geometry matches automatically; users can broaden selection to near-matches.
4. Recurse to any depth. Each instance's position and orientation is stored relative to its **direct parent**, preserving correct nesting regardless of depth.

### 6.2 Source-file handling

- If the source USD has a named prim hierarchy, Spatial Layout surfaces it as a tree beside the 3D view with cross-highlighting, proposes named subtrees as instances, and pre-assigns names matching existing entity types.
- A flat or unlabeled file falls back to direct 3D selection.
- Unattributed geometry stays with its nearest ancestor; **nothing is silently dropped**. A running indicator shows how much geometry remains attributed to each ancestor.
- The source USD file is **never mutated**. Each promoted selection is extracted into its own USD asset; the imported instance retains the remainder.

### 6.3 Scale limits

Decomposition is bounded by practical limits. Very large or complex USD files are better served by a professional CAD/BIM plugin (see Ecosystem) that exports a conformant package directly.

## 7. Functional requirements

### 7.1 Navigation and ontology operations

- FR-1: Create, rename, and delete entity types.
- FR-2: Create, rename, and delete entity instances under a type.
- FR-3: Create a containment relationship type from one entity type to another (existing or newly created).
- FR-4: Enforce that a contained type has geometry before its instances can be placed; auto-create default geometry when the type is created in this flow.

### 7.2 Geometry authoring

- FR-5: Drop basic shapes (box, cylinder, plane) onto the type's or instance's geometry.
  - **FR-5.1 (implemented):** Shapes palette with **box, cylinder, sphere, plane**. Dragging a palette item onto the viewport spawns a prim at the picked ground point; dragging onto a hierarchy node spawns the prim parented to that node (root "Scene" target parents to null).
  - **FR-5.2 (implemented):** Each prim has an editable color (color picker + hex input in the Properties panel) and unique auto-named label (e.g. `Box_1`, `Cylinder_2`).
- FR-6: Drop SimReady library assets onto geometry.
- FR-7: Import one or more USD files into the item; reference one or more OneLake folders of USD assets.
- FR-8: Per-instance geometry override; revert to type default.
- FR-9: Promote an instance's geometry to the type's default.

### 7.3 Instance placement

- FR-10: Place a tracked child instance by selecting a type from the Entities palette while an instance is selected.
  - **FR-10.1 (implemented, untracked):** A flat **Hierarchy panel** lists every prim under a synthetic "Scene" root. Dragging a prim onto another prim reparents it; dragging it onto the root unparents it. Dragging a shape from the palette onto a hierarchy node spawns a new child under that node. Reparenting **preserves world transform** (the local TRS is recomputed from the new parent's world matrix), so a drop does not visually teleport the prim. Cycles are prevented (a node cannot be reparented under its own descendant).
- FR-11: When placing, choose an existing instance ID from a data-backed list or enter a new ID.
- FR-12: Record the child's position and orientation **relative to the parent**.
  - **FR-12.1 (implemented):** Every prim stores `position`, `rotation` (Euler radians), and `scale` in its **parent's local frame** (world frame when `parentId` is null). World matrices are composed up the parent chain on demand.
- FR-13: For moving assets, place at a placeholder position; do not author live position.

### 7.4 Viewport interaction

- FR-14: Orbit, pan, zoom in 3D. Top-down 2D mode.
  - **FR-14.1 (implemented):** `ArcRotateCamera` controls — left mouse drag orbits, right mouse drag pans, mouse wheel zooms. `allowUpsideDown` is on so the user can roll past the poles; radius is clamped to `[1, 5000]`.
  - **FR-14.2 (implemented):** Infinite-feeling ground (10,000 × 10,000 m) on the X–Z plane with origin at `(0, 0, 0)`, rendered with a mostly-transparent `GridMaterial` (opacity 0.25).
  - **FR-14.3 (implemented):** World unit is **1 meter**. Grid shows minor lines every **1 m** and major lines every **10 m** (`gridRatio = 1`, `majorUnitFrequency = 10`). Y is up.
  - **FR-14.4 (implemented):** Origin axis indicators at `(0, 0, 0)` — **X red**, **Y green**, **Z blue**, each 2 m long.
  - **FR-14.5 (implemented):** Camera-view overlay (top-right): **Top / Bottom / Front / Back / Left / Right** snap the camera to an orthographic view aligned with that axis; **Perspective** restores a perspective camera at the default 3/4 view (`alpha = π/4`, `beta = π/3`). Ortho frustum tracks camera radius so wheel-zoom still feels natural.
- FR-15: Transform handles for position, rotation, scale.
  - **FR-15.1 (implemented):** Left toolbar selects the active tool — **Select**, **Move**, **Rotate**, **Scale**. Move/Rotate/Scale show the matching Babylon gizmo on the selected prim; Select shows no gizmo. Gizmo handles are tinted to match the origin axes (X red, Y green, Z blue) so the manipulator axes read as the world axes.
  - **FR-15.2 (implemented):** Rotation rings are **world-axis aligned** (`updateGizmoRotationToMatchAttachedMesh = false`) to avoid the Babylon issue where non-uniform scale breaks attached-mesh rotation tracking. Rotation is stored as a quaternion on the mesh and converted back to Euler radians on drag-end.
  - **FR-15.3 (implemented):** Selection — click a mesh in the viewport or a row in the Hierarchy panel; clicking empty space or the ground deselects. The selected prim gets a blue edge outline.
- FR-16: Snap to floor, walls, configurable grid.
  - **FR-16.1 (implemented, partial):** Move snap = **1 m** (grid minor tick). Rotate snap = **5°**. Scale snap = **0.25**. No floor/wall snap yet.
- FR-17: Configurable units; distance measurement.
- FR-18: Multi-select, copy, distribute, rotate, mirror.
- FR-19: Undo / redo across all actions.
- FR-20: Named camera positions.

### 7.5 Persistence

- FR-21: Save materializes ontology, tables, and USD assets to the child Ontology item and child Lakehouse item.
- FR-22: Abandoned sessions write nothing.
- FR-23: Reopening an item reconstructs the scene by composition from its artifacts.

### 7.6 Decomposition

- FR-24: Import a USD file into a selected entity instance.
- FR-25: Select geometry in the viewport and promote to an instance or to a type default.
- FR-26: Automatic exact-match detection across geometry; allow user-broadened near-match selection.
- FR-27: Surface a prim-hierarchy tree with cross-highlighting when the source file is named; propose subtrees as instances with pre-assigned names matching existing types.
- FR-28: Show running indicator of unattributed geometry per ancestor.
- FR-29: Never mutate the source USD file; extract promoted selections into their own USD assets.

### 7.7 Accessibility

- FR-30: Full keyboard navigation across navigation pane, palettes, and viewport.
- FR-31: Screen-reader labels on all interactive elements and scene objects.
- FR-32: UI meets contrast requirements.

## 8. Data and artifact model

Spatial Layout owns three artifact classes:

| Artifact | Stored in | Purpose |
|---|---|---|
| Ontology (entity types, containment relationship types, geometry property, optional per-instance binding) | Child **Ontology item** | Schema |
| Instance rows; containment rows (parent, child, position, orientation); per-instance geometry overrides | Tables in child **Lakehouse item** | Data |
| USD assets (type defaults; per-instance overrides; extracted-from-decomposition assets) | Files in child **Lakehouse item** | Geometry |

Key invariants:

- Position and orientation are always stored **relative to the direct parent**.
- A type's geometry is its default; instances share it by reference unless overridden.
- Entity instance IDs are the join key for composition with other ontologies.
- The composed 3D scene is **derived**; it is never persisted.

## 9. Architecture notes

- The viewport is expected to be built on a reusable 3D library (e.g., Babylon.js) to accelerate development.
- The runtime composes the scene from ontology + tables + USD on session start, applies edits as ontology/table/USD mutations, and re-composes incrementally.
- The Save operation is the only path that writes to the underlying Fabric items.

## 10. Sequencing (staged build)

Each stage proves the conceptual model further and is independently shippable internally.

1. **Core authoring**
   - Navigation pane CRUD for entity types and instances.
   - Shapes palette (basic geometry) and Entities palette.
   - Containment relationship type declaration.
   - Instance placement by manual ID.
   - Instance geometry override + revert to type default.
   - Promote instance geometry to type default.
   - 3D viewport with orbit/pan/zoom, drag-and-drop placement, scaling, transform handles, live preview.
   - Save and reload to/from JSON, CSV, and USD.
2. **Editing precision** — snapping (floor, walls, grid); units; distance measurement.
3. **Bulk operations and views** — multi-select, copy, distribution, rotation, mirroring; 2D top-down view; named camera positions; undo/redo.
4. **USD import and asset library** — upload USD or point to a OneLake folder; SimReady library in the Shapes palette.
5. **Decomposition** — re-attribute geometry to child instances and type defaults; automatic geometry matching; prim hierarchy tree with cross-highlighting; depth-unlimited containment.
6. **Fabric item** — first-class Fabric item writing directly to a child Ontology item and child Lakehouse item; renderable in the Physical Space item on save.
7. **Ontology reference** — reference an existing Ontology item as a source of entity types and instance IDs; browse and place from the enterprise ontology rather than typing IDs.
8. **Quality, scale, and extensibility** — accessibility, robustness, performance, scalability, export.

**MVP target (Ignite 2026):** the self-contained spatial-focused ontology, its tables, and its USD assets, with a visual authoring experience for the common case.

## 11. Ecosystem

Spatial Layout addresses ~80% of cases: customers who build from basic shapes and SimReady. The remaining ~20% need high-fidelity environments that typically live in CAD/BIM.

Fabric will publish a guide for ISVs and the community on how to produce **conformant assets**:

- Geometry as USD.
- Instance and containment data as CSV or Parquet.
- Ontology as OWL/RDF or JSON.

A conformant tool can write these files for import, or create the child Ontology and Lakehouse items directly. Either path feeds the same pipeline as Spatial Layout. The call to action for ISVs is to ship plugins for widely used CAD/BIM tools that decompose complex geometry into entity types, instances, containment relationships, and entity geometry.

## 12. Telemetry and success metrics

Measured against the "5x5" north star and product-led growth.

- **Time to first composed scene** from item creation (target: minutes).
- **Activation rate** — % of new items that reach a saved layout with ≥1 entity type, ≥1 contained instance, and non-default geometry.
- **Fidelity progression** — % of items that replace at least one type default with imported USD over time.
- **Decomposition adoption** — % of items created via USD import vs. from-scratch.
- **Round-trip integrity** — % of save/reopen cycles that reconstruct an identical scene.
- **Composition reach** — % of instance IDs that match IDs in an enterprise ontology in the same workspace.

## 13. Open questions

- Exact contract for the "conformant package" (file layout, schema versions).
- Snapping precision and grid defaults; how units interact with imported USD's native units.
- Behavior when a referenced enterprise ontology renames or deletes an instance ID that Spatial Layout has placed.
- Conflict resolution if two authors edit the same Spatial Layout item concurrently.
- Performance ceiling for the on-demand composed scene (instance count, USD complexity).
- Decomposition near-match tolerance — defaults and user controls.
- Export formats and destinations beyond the child Lakehouse item.

## 14. Out of scope (restated)

- Non-spatial property/relationship authoring.
- Live data binding and streaming.
- Real-time rendering against streaming data.
- Authoring of moving-asset live position.
- Writing into customer-owned (non-generated) tables.
- CAD-grade geometry authoring.

## 15. Current prototype status

This section is a snapshot of what the `drewscenes` prototype in this repo actually does today. It is a single-user, in-memory React + Babylon.js sandbox — there is no ontology, no entity-type vs. instance distinction, no persistence, and no Fabric integration yet. "Prim" in the code is the prototype's stand-in for a future entity instance.

### 15.1 App shell

- React 19 + Vite + TypeScript app rendering Babylon.js into a single viewport.
- Four-panel layout: **Left toolbar** (tools), **Viewport** (3D canvas + camera overlay), **Hierarchy panel** (right-top), **Properties panel** (right-bottom), **Shapes palette** (bottom).

### 15.2 Scene and camera

- `ArcRotateCamera` with orbit / pan / wheel-zoom; radius clamped to `[1, 5000]`; `allowUpsideDown` on.
- Default camera: 3/4 perspective view (`alpha = π/4`, `beta = π/3`, `radius = 25`) targeting the origin.
- 10,000 × 10,000 m ground on X–Z with `GridMaterial` (1 m minor / 10 m major, opacity 0.25). Y is up; 1 unit = 1 meter.
- Origin axis indicators (2 m each): X red, Y green, Z blue.
- Hemispheric light from `+Y`.
- Camera-view overlay (top-right): **Top / Bottom / Front / Back / Left / Right** switch to an axis-aligned orthographic view; **Perspective** returns to the default angle. Ortho frustum tracks the camera radius.

### 15.3 Shape authoring

- Shapes palette: **box, cylinder, sphere, plane**. All unit-sized.
- Drop a palette item:
  - on the viewport → spawn at the picked ground point, lifted by the shape's half-height so it rests on the ground.
  - on a hierarchy node → spawn parented to that node at the parent's local origin.
  - on the Scene root row → spawn unparented at world origin (lifted by half-height).
- Auto-naming per kind: `Box_1`, `Box_2`, `Cylinder_1`, etc.
- IDs are `crypto.randomUUID()`.

### 15.4 Selection and manipulation

- Click a mesh in the viewport or a row in the Hierarchy panel to select; click empty space, the ground, or the Hierarchy background to deselect.
- Selected prim gets a blue edge outline.
- Left toolbar tools: **Select**, **Move**, **Rotate**, **Scale**. Each non-Select tool shows the matching Babylon gizmo on the selected prim.
- Gizmo handles tinted X red / Y green / Z blue.
- Snapping: position **1 m**, rotation **5°**, scale **0.25**.
- Rotation rings are world-axis aligned and rotation is stored on the mesh as a quaternion; the prototype writes Euler radians back to state on drag-end.

### 15.5 Hierarchy

- Flat list grouped into a tree by `parentId` under a synthetic "Scene" root.
- Drag a prim row onto another prim row to **reparent** under it; drag onto the Scene row to unparent.
- Reparenting **preserves world transform** (local TRS is recomputed from the new parent's world matrix). Cycles are prevented.
- Drag a palette shape onto a tree row to spawn a new child under it.

### 15.6 Properties

- For the selected prim: read-only **ID** and **Kind**; editable **Name**, **Position (x/y/z, meters)**, **Rotation (x/y/z, degrees)**, **Color** (color picker + hex input).
- All edits round-trip through the same state the viewport reads from, so the gizmo and property fields stay in sync.

### 15.7 Not yet in the prototype

These are called out in the spec but are not in the prototype:

- Entity types vs. instances (everything is a single "prim" today).
- Containment relationship types.
- USD / SimReady / imported asset support.
- Per-instance geometry override and promote-to-default.
- Multi-select, copy, distribute, mirror, undo/redo.
- Snap to floor/walls; distance measurement; configurable units.
- Named camera positions.
- Persistence — closing the tab loses everything.
- Decomposition, ontology composition, Fabric item wiring.
