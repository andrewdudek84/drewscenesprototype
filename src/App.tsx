import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import BottomPanel from './components/BottomPanel';
import ContextMenu, {
  type ContextMenuItem
} from './components/ContextMenu';
import EntityModelsPanel, {
  HIDDEN_ENTITY_TYPE_NAMES
} from './components/EntityModelsPanel';
import HierarchyPanel from './components/HierarchyPanel';
import LeftToolbar from './components/LeftToolbar';
import OntologyPanel from './components/OntologyPanel';
import PropertiesPanel from './components/PropertiesPanel';
import TopBar, { type Theme } from './components/TopBar';
import Viewport from './components/Viewport';
import { ASSET_LIBRARY, getAsset } from './assets';
import {
  addEntityInstance,
  addEntityType,
  addEntityTypeParent,
  applyBindingsToOntology,
  buildModelTree,
  buildOntology,
  DEFAULT_ENTITY_TYPE,
  loadHospitalOntologyDoc,
  moveEntityType,
  removeModelRelationship,
  removeEntityInstance,
  removeEntityType,
  removeEntityTypeParent,
  renameEntityInstance,
  renameEntityType,
  setEntityInstanceParent,
  setEntityTypeParent,
  updateEntityInstance,
  updateEntityType,
  upsertModelRelationship,
  type OntologyDoc,
  type OntologyEntity,
  type OntologyEntityType,
  type OntologyRelationship,
  type SpatialBinding
} from './ontology';
import { exportToUsda, parseUsda } from './usd';
import type {
  AssetMeshNode,
  PrimNode,
  PrimPatch,
  PrimTransform,
  ShapeKind,
  SubMeshInfo,
  ToolMode,
  Vec3
} from './types';

const KIND_LABELS: Record<ShapeKind, string> = {
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
const SPAWN_HALF_HEIGHT: Record<ShapeKind, number> = {
  box: 0.5,
  cylinder: 0.5,
  sphere: 0.5,
  plane: 0.001,
  cone: 0.5,
  group: 0,
  // Reference prims carry their own pivot inside the GLB; don't add a lift.
  reference: 0
};

const DEFAULT_COLOR = '#b3b3b8';

// Maps primitive shape kinds to the matching `usd_shapes/<Name>.usda` wrapper
// so a plain Box / Cylinder / etc. can be drag-bound to an ontology
// SpatialItem the same way library Assets are.
const SHAPE_USDA: Partial<Record<ShapeKind, string>> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  plane: 'Plane'
};

export default function App() {
  const [inspectorSelection, setInspectorSelection] = useState<
    | { kind: 'model-type'; name: string }
    | { kind: 'model-relationship'; index: number }
    | null
  >(null);
  // Currently selected ontology entity instance. When set, the Properties
  // panel shows the instance form (takes priority over prim selection).
  // Cleared whenever the user picks something else (prim, model type, etc.).
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
    const [prims, setPrims] = useState<PrimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Identifies a specific sub-mesh inside a loaded reference asset when the
  // user clicks one (in the viewport or hierarchy). Null when the selection
  // is the whole prim. Always cleared when `selectedId` flips to a different
  // prim or to null.
  const [selectedMeshUid, setSelectedMeshUid] = useState<string | null>(null);
  // Per-reference-prim cache of the internal node/mesh tree from the loaded
  // GLB/OBJ. Populated by the Viewport once each asset finishes loading.
  const [assetMeshes, setAssetMeshes] = useState<Record<string, AssetMeshNode[]>>({});
  // Pose/name of the currently selected sub-mesh inside a loaded asset, so
  // the Properties panel can display it. Null when the selection is a
  // top-level prim or nothing.
  const [subMeshInfo, setSubMeshInfo] = useState<SubMeshInfo | null>(null);
  const [tool, setTool] = useState<ToolMode>('move');
  // Grid snapping is on by default; the snap button in the LeftToolbar
  // toggles it. When off, gizmo drags move/rotate/scale continuously.
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [sceneName, setSceneName] = useState<string>(() => randomSceneName());
  const [theme, setTheme] = useState<Theme>(() => {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('drewscenes:theme')
        : null;
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('drewscenes:theme', theme);
    } catch {
      // localStorage may be unavailable (private mode, etc.); not fatal.
    }
  }, [theme]);

  const countersRef = useRef<Record<ShapeKind, number>>({
    box: 0,
    cylinder: 0,
    sphere: 0,
    plane: 0,
    cone: 0,
    group: 0,
    reference: 0
  });

  const handleShapeDropped = useCallback(
    (kind: ShapeKind, position: Vec3) => {
      const n = (countersRef.current[kind] ?? 0) + 1;
      countersRef.current[kind] = n;
      const name = `${KIND_LABELS[kind]}_${n}`;
      const halfH = SPAWN_HALF_HEIGHT[kind];
      const prim: PrimNode = {
        id: newId(),
        name,
        kind,
        position: [position[0], position[1] + halfH, position[2]],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        parentId: null,
        color: DEFAULT_COLOR
      };
      setPrims((prev) => [...prev, prim]);
      setSelectedId(prim.id);
    },
    []
  );

  // Spawn a new prim parented to the given hierarchy node (null = scene root).
  // The local position is at the parent's origin lifted by the shape's half-height
  // so the new prim isn't co-located with the parent's pivot.
  const handleShapeAddToParent = useCallback(
    (kind: ShapeKind, parentId: string | null) => {
      const n = (countersRef.current[kind] ?? 0) + 1;
      countersRef.current[kind] = n;
      const name = `${KIND_LABELS[kind]}_${n}`;
      const halfH = SPAWN_HALF_HEIGHT[kind];
      const prim: PrimNode = {
        id: newId(),
        name,
        kind,
        position: parentId === null ? [0, halfH, 0] : [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        parentId,
        color: DEFAULT_COLOR
      };
      setPrims((prev) => [...prev, prim]);
      setSelectedId(prim.id);
    },
    []
  );

  const handleTransform = useCallback(
    (id: string, t: Partial<PrimTransform>) => {
      setPrims((prev) => prev.map((p) => (p.id === id ? { ...p, ...t } : p)));
    },
    []
  );

  const handleUpdate = useCallback((id: string, patch: PrimPatch) => {
    setPrims((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleReparent = useCallback(
    (sourceId: string, parentId: string | null) => {
      setPrims((prev) => {
        if (parentId === sourceId) return prev;
        const source = prev.find((p) => p.id === sourceId);
        if (!source) return prev;
        if (source.parentId === parentId) return prev;
        if (parentId !== null && isDescendant(prev, sourceId, parentId)) {
          return prev;
        }
        // Preserve world transform across the reparent so the user's drag
        // doesn't visually teleport the shape.
        const worldM = getWorldMatrix(prev, sourceId);
        const newParentWorldM =
          parentId === null
            ? Matrix.Identity()
            : getWorldMatrix(prev, parentId);
        const newLocal = worldM.multiply(invertMatrix(newParentWorldM));
        const { position, rotation, scale } = decomposeMatrix(newLocal);
        return prev.map((p) =>
          p.id === sourceId
            ? { ...p, parentId, position, rotation, scale }
            : p
        );
      });
    },
    []
  );

  // Delete a prim and every descendant under it.
  const handleDelete = useCallback((id: string) => {
    setPrims((prev) => {
      const doomed = new Set<string>([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of prev) {
          if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
            doomed.add(p.id);
            grew = true;
          }
        }
      }
      setAssetMeshes((cur) => {
        let next = cur;
        for (const did of doomed) {
          if (did in next) {
            if (next === cur) next = { ...cur };
            delete next[did];
          }
        }
        return next;
      });
      // Drop any ontology binding whose target prim (or an ancestor of it)
      // is being deleted, so SpatialItems don't keep a stale USD / guid.
      setBindings((cur) => {
        let next = cur;
        for (const [eid, b] of Object.entries(cur)) {
          if (doomed.has(b.guid)) {
            if (next === cur) next = { ...cur };
            delete next[eid];
          }
        }
        return next;
      });
      return prev.filter((p) => !doomed.has(p.id));
    });
    setSelectedId((cur) => (cur === id ? null : cur));
    setSelectedMeshUid((cur) => (selectedId === id ? null : cur));
  }, [selectedId]);

  // Duplicate a prim and every descendant under it. Each clone gets a fresh
  // id; parent references inside the clone tree are rewritten so the new
  // sub-tree mirrors the original structure. The root clone's name gets the
  // next available `_<n>` suffix so it's visually distinct in the hierarchy.
  const handleDuplicate = useCallback(
    (id: string) => {
      const byId = new Map(prims.map((p) => [p.id, p] as const));
      const root = byId.get(id);
      if (!root) return;
      const order: PrimNode[] = [];
      const visit = (pid: string) => {
        const p = byId.get(pid);
        if (!p) return;
        order.push(p);
        for (const child of prims) {
          if (child.parentId === pid) visit(child.id);
        }
      };
      visit(id);
      const idMap = new Map<string, string>();
      for (const p of order) idMap.set(p.id, newId());
      const newRootId = idMap.get(id)!;
      const existingNames = new Set(prims.map((p) => p.name));
      const rootName = nextDuplicateName(root.name, existingNames);
      const clones: PrimNode[] = order.map((p) => ({
        ...p,
        id: idMap.get(p.id)!,
        name: p.id === id ? rootName : p.name,
        parentId:
          p.id === id ? p.parentId : idMap.get(p.parentId ?? '') ?? p.parentId,
        position: [...p.position],
        rotation: [...p.rotation],
        scale: [...p.scale]
      }));
      setPrims((prev) => [...prev, ...clones]);
      setSelectedId(newRootId);
      setSelectedMeshUid(null);
    },
    [prims]
  );

  const handleSelect = useCallback(
    (id: string | null, meshUid: string | null = null) => {
      setInspectorSelection(null);
      setSelectedInstanceId(null);
      setSelectedId(id);
      setSelectedMeshUid(id ? meshUid : null);
    },
    []
  );

  // Viewport picks always promote selection to the topmost ancestor prim
  // and never surface a sub-mesh — the user wants the whole asset selected
  // (and outlined) when they click anything in the 3D view, regardless of
  // which leaf mesh was hit.
  const handleViewportSelect = useCallback(
    (id: string | null) => {
      if (!id) {
        handleSelect(null);
        return;
      }
      const byId = new Map(prims.map((p) => [p.id, p] as const));
      let cur = byId.get(id);
      if (!cur) {
        handleSelect(null);
        return;
      }
      while (cur.parentId) {
        const parent = byId.get(cur.parentId);
        if (!parent) break;
        cur = parent;
      }
      handleSelect(cur.id, null);
    },
    [prims, handleSelect]
  );

  const handleAssetMeshesLoaded = useCallback(
    (primId: string, nodes: AssetMeshNode[]) => {
      setAssetMeshes((cur) => {
        const had = primId in cur;
        if (nodes.length === 0) {
          if (!had) return cur;
          const next = { ...cur };
          delete next[primId];
          return next;
        }
        return { ...cur, [primId]: nodes };
      });
    },
    []
  );

  const selectedPrim =
    selectedId ? prims.find((p) => p.id === selectedId) ?? null : null;

  // Ontology data + per-entity bindings live here so the Hierarchy and
  // Properties panels can show "is mapped" indicators next to the asset prim.
  // The doc is the source of truth (the runtime tree is derived); replacing
  // it via import swaps the entire ontology in one shot.
  const [ontologyDoc, setOntologyDoc] = useState<OntologyDoc>(() =>
    loadHospitalOntologyDoc()
  );
  const ontology = useMemo(() => buildOntology(ontologyDoc), [ontologyDoc]);
  const modelRoots = useMemo(() => buildModelTree(ontologyDoc), [ontologyDoc]);
  const modelRelationships = useMemo(
    () => ontologyDoc.model?.relationships ?? [],
    [ontologyDoc]
  );
  const selectedModelType: OntologyEntityType | null = useMemo(() => {
    if (inspectorSelection?.kind !== 'model-type') return null;
    return (
      ontologyDoc.model?.entityTypes.find(
        (t) => t.name === inspectorSelection.name
      ) ?? null
    );
  }, [inspectorSelection, ontologyDoc]);
  const selectedModelRelationship: OntologyRelationship | null = useMemo(() => {
    if (inspectorSelection?.kind !== 'model-relationship') return null;
    return modelRelationships[inspectorSelection.index] ?? null;
  }, [inspectorSelection, modelRelationships]);
  const [bindings, setBindings] = useState<Record<string, SpatialBinding>>({});
  const handleBind = useCallback(
    (entityId: string, binding: SpatialBinding) => {
      // A prim can only be bound to one SpatialItem at a time: clear any
      // existing entry that points at the same group prim before writing the
      // new mapping so the old SpatialItem visibly loses its check mark.
      setBindings((cur) => {
        const next: Record<string, SpatialBinding> = {};
        for (const [eid, b] of Object.entries(cur)) {
          if (b.guid !== binding.guid && eid !== entityId) next[eid] = b;
        }
        next[entityId] = binding;
        return next;
      });
    },
    []
  );

  // Reverse index: primId -> the SpatialItem entity it is bound to. Keyed by
  // the bound group's prim id (`binding.guid`) so the green-check indicator
  // and the Properties "Mapped" row appear on the asset's top-level wrapper
  // — the same node that viewport picks promote to.
  const mappedByPrimId = useMemo(() => {
    const entityById = new Map(ontology.entities.map((e) => [e.id, e] as const));
    const m = new Map<string, { entityId: string; entityName: string }>();
    for (const [entityId, b] of Object.entries(bindings)) {
      const entity = entityById.get(entityId);
      if (!entity) continue;
      m.set(b.guid, { entityId, entityName: entity.name });
    }
    return m;
  }, [bindings, ontology]);

  // Cross-panel selection sync: the bound group prim id maps to the bound
  // SpatialItem entity id. Since viewport picks promote to the top ancestor
  // (which IS the group), this single mapping is enough to drive highlight
  // round-trips with the Hierarchy / Properties / Ontology panels.
  const entityIdByPrimId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [entityId, b] of Object.entries(bindings)) m.set(b.guid, entityId);
    return m;
  }, [bindings]);

  const selectedEntityId = selectedId ? entityIdByPrimId.get(selectedId) ?? null : null;

  // Map a (possibly hidden) USD-child entity id back to its parent. Used so
  // a viewport prim pick highlights the parent row in the Ontology panel
  // (the USD child itself isn't rendered there). Falls through unchanged
  // when the id is already a non-USD entity, or has no HasUSD parent.
  const collapseUsdChildToParent = useCallback(
    (entityId: string | null): string | null => {
      if (!entityId) return null;
      const ent = ontologyDoc.instances.entities.find((e) => e.id === entityId);
      if (!ent || ent.type !== 'USD') return entityId;
      const parentRel = ontologyDoc.instances.relationships.find(
        (r) => r.type === 'HasUSD' && r.target === entityId
      );
      return parentRel?.source ?? entityId;
    },
    [ontologyDoc]
  );

  // Inverse lookup used when the user clicks a SpatialItem row: bring focus
  // to the bound group prim so the viewport gizmo + Properties panel update.
  const primIdByEntityId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [entityId, b] of Object.entries(bindings)) m.set(entityId, b.guid);
    return m;
  }, [bindings]);

  const handleSelectOntologyEntity = useCallback(
    (entityId: string) => {
      setInspectorSelection(null);
      setSelectedInstanceId(entityId);
      let primId = primIdByEntityId.get(entityId);
      if (!primId) {
        // Parent rows have no prim of their own; fall back to the bound prim
        // of their hidden USD child so clicking the parent still focuses the
        // viewport gizmo.
        const usdChildId = ontologyDoc.instances.relationships.find(
          (r) => r.type === 'HasUSD' && r.source === entityId
        )?.target;
        if (usdChildId) primId = primIdByEntityId.get(usdChildId);
      }
      if (primId) {
        setSelectedId(primId);
        setSelectedMeshUid(null);
      } else {
        setSelectedId(null);
        setSelectedMeshUid(null);
      }
    },
    [primIdByEntityId, ontologyDoc]
  );

  // Resolves a prim id to an ontology binding. Walks up the parent chain so
  // dragging an inner reference node still binds to its owning asset wrapper.
  // Returns the matched library Asset (`/usd_assets/<id>.usda`) when the
  // ancestor is a Group spawned from the library, otherwise falls back to the
  // topmost primitive shape (`/usd_shapes/<Kind>.usda`).
  const resolvePrimAsAsset = useCallback(
    (primId: string) => {
      const byId = new Map(prims.map((p) => [p.id, p] as const));
      let cur: PrimNode | undefined = byId.get(primId);
      let topmost: PrimNode | undefined;
      while (cur) {
        if (cur.kind === 'group' && cur.assetId) {
          return {
            guid: cur.id,
            usdaUrl: `/usd_assets/${cur.assetId}.usda`,
            name: cur.name
          };
        }
        topmost = cur;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      if (topmost) {
        const shapeUsda = SHAPE_USDA[topmost.kind];
        if (shapeUsda) {
          return {
            guid: topmost.id,
            usdaUrl: `/usd_shapes/${shapeUsda}.usda`,
            name: topmost.name
          };
        }
      }
      return null;
    },
    [prims]
  );

  const handleExport = useCallback(() => {
    // Combined scene file: { Scene: <usda text>, Ontology: <ontology doc> }.
    // SpatialItem urls in the exported ontology reflect the current bindings
    // so the saved file captures both the 3D scene and the entity\u2194asset map.
    const usda = exportToUsda(prims, sceneName);
    const primPoseById = new Map(
      prims.map((p) => [p.id, { position: p.position, rotation: p.rotation }] as const)
    );
    const ontologyOut = applyBindingsToOntology(ontologyDoc, bindings, primPoseById);
    const payload = { Scene: usda, Ontology: ontologyOut };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileSafe(sceneName)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [prims, sceneName, ontologyDoc, bindings]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      // Accept the combined JSON envelope (new format) or a legacy `.usda`.
      const looksJson = /\.json$/i.test(file.name) || text.trimStart().startsWith('{');
      let usdaText: string;
      let ontologyOverride: OntologyDoc | null = null;
      if (looksJson) {
        const parsed = JSON.parse(text) as { Scene?: string; Ontology?: OntologyDoc };
        if (typeof parsed.Scene !== 'string') {
          throw new Error('Combined scene file is missing a "Scene" string.');
        }
        usdaText = parsed.Scene;
        if (parsed.Ontology) ontologyOverride = parsed.Ontology;
      } else {
        usdaText = text;
      }

      const scene = parseUsda(usdaText);
      setPrims(scene.prims);
      setSelectedId(null);
      setSelectedMeshUid(null);
      setSubMeshInfo(null);
      setAssetMeshes({});
      if (ontologyOverride) {
        setOntologyDoc(ontologyOverride);
        const primById = new Map(scene.prims.map((p) => [p.id, p] as const));
        const restored: Record<string, SpatialBinding> = {};
        for (const e of ontologyOverride.instances.entities) {
          const guid = e.guid ?? '';
          const usd = e.usd ?? '';
          if (!guid || !usd) continue;
          const prim = primById.get(guid);
          if (!prim) continue;
          restored[e.id] = { guid, usd, name: prim.name };
        }
        setBindings(restored);
      } else {
        setBindings({});
      }
      const nameFromFile = file.name.replace(/\.(json|usda?|txt)$/i, '');
      setSceneName(nameFromFile || scene.sceneName || 'Loaded Scene');
      countersRef.current = {
        box: 0,
        cylinder: 0,
        sphere: 0,
        plane: 0,
        cone: 0,
        group: 0,
        reference: 0
      };
    } catch (err) {
      console.error('Scene load failed', err);
      alert(
        'Could not load that file. Expected a .json scene saved by drewscenes (or a legacy .usda).'
      );
    }
  }, []);

  // Spawn an asset's prim tree at a viewport drop point. Wrap everything in a
  // single Group prim positioned at the drop point so the asset shows up as one
  // movable object in the hierarchy. The group's name is the asset's top-level
  // Xform name from the USDA (or the asset id if missing).
  const handleAssetDropped = useCallback(
    (assetId: string, dropAt: Vec3) => {
      spawnAssetUnder(assetId, null, dropAt);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Same as `handleAssetDropped` but used when the user drags an asset onto a
  // node in the Hierarchy panel: the asset's group prim is parented to the
  // dropped-on prim with a local origin of [0,0,0].
  const handleAssetAddToParent = useCallback(
    (assetId: string, parentId: string | null) => {
      spawnAssetUnder(assetId, parentId, [0, 0, 0]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Shared body for the two callbacks above. Closes over `setPrims` and
  // `setSelectedId`; doesn't read other state so the empty dep arrays on
  // the wrappers are safe.
  function spawnAssetUnder(
    assetId: string,
    parentId: string | null,
    at: Vec3,
    forcedName?: string
  ): string | null {
    const asset = getAsset(assetId);
    if (!asset) return null;
    let parsed;
    try {
      parsed = parseUsda(asset.usda);
    } catch (err) {
      console.error('Asset parse failed', assetId, err);
      return null;
    }
    if (parsed.prims.length === 0) return null;

    const groupId = newId();
    const groupPrim: PrimNode = {
      id: groupId,
      name: forcedName?.trim() || parsed.sceneName || asset.label,
      kind: 'group',
      position: at,
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      parentId,
      assetId,
      color: DEFAULT_COLOR
    };
    // Reparent the asset's roots under our new group; leave their local
    // transforms untouched so the geometry composes correctly under the group.
    const newPrims: PrimNode[] = parsed.prims.map((p) =>
      p.parentId === null ? { ...p, parentId: groupId } : p
    );

    setPrims((prev) => [...prev, groupPrim, ...newPrims]);
    setSelectedId(groupId);
    return groupId;
  }

  const SHAPE_KIND_BY_USDA = new Map<string, ShapeKind>([
    ['box', 'box'],
    ['cylinder', 'cylinder'],
    ['sphere', 'sphere'],
    ['plane', 'plane'],
    ['cone', 'cone']
  ]);

  // USD-backed entity models spawn directly into the viewport and return the
  // created prim id so the instance's companion SpatialItem can be bound.
  function spawnFromModelUsd(
    modelUsd: string,
    instanceName: string,
    parentPrimId: string | null
  ): { guid: string; name: string } | null {
    const raw = modelUsd.trim();
    if (!raw) return null;
    const normalized = raw.replace(/^\.\//, '').replace(/^\/+/, '');
    const lower = normalized.toLowerCase();

    const shapeMatch = /(?:^|\/)usd_shapes\/([^/]+)\.usd[ac]?$/i.exec(normalized);
    if (shapeMatch) {
      const kind = SHAPE_KIND_BY_USDA.get(shapeMatch[1].toLowerCase());
      if (!kind) return null;
      const n = (countersRef.current[kind] ?? 0) + 1;
      countersRef.current[kind] = n;
      const name = instanceName.trim() || `${KIND_LABELS[kind]}_${n}`;
      const halfH = SPAWN_HALF_HEIGHT[kind];
      const prim: PrimNode = {
        id: newId(),
        name,
        kind,
        position: parentPrimId ? [0, 0, 0] : [0, halfH, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        parentId: parentPrimId,
        color: DEFAULT_COLOR
      };
      setPrims((prev) => [...prev, prim]);
      setSelectedId(prim.id);
      return { guid: prim.id, name: prim.name };
    }

    let assetHint: string | null = null;
    const nestedAssetMatch = /(?:^|\/)usd_assets\/([^/]+)\//i.exec(normalized);
    if (nestedAssetMatch) assetHint = nestedAssetMatch[1];
    const wrapperAssetMatch = /(?:^|\/)usd_assets\/([^/]+)\.usd[ac]?$/i.exec(normalized);
    if (!assetHint && wrapperAssetMatch) assetHint = wrapperAssetMatch[1];
    if (!assetHint && lower.includes('hospitalbed')) assetHint = 'HospitalBed';

    if (assetHint) {
      const matchedAssetId =
        ASSET_LIBRARY.find((a) => a.id.toLowerCase() === assetHint!.toLowerCase())
          ?.id ?? null;
      if (!matchedAssetId) return null;
      const name = instanceName.trim() || matchedAssetId;
      const guid = spawnAssetUnder(matchedAssetId, parentPrimId, [0, 0, 0], name);
      if (!guid) return null;
      return { guid, name };
    }
    return null;
  }

  // Focus = reset camera to its initial view. Bumping the counter signals
  // the Viewport to run a full reset; both the toolbar button and the 'F'
  // hotkey go through this single channel.
  const [focusSignal, setFocusSignal] = useState(0);
  const handleFocus = useCallback(() => {
    setFocusSignal((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      // Don't hijack typing in inputs / textareas / contenteditable fields.
      const t = ev.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (t.isContentEditable) return;
      }
      if (ev.key === 'f' || ev.key === 'F') {
        ev.preventDefault();
        handleFocus();
      } else if (ev.key === 'm' || ev.key === 'M') {
        ev.preventDefault();
        setTool('measure');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleFocus]);

  // Right-click menu state. Holds the page-space anchor point and the items
  // to render. Panels (prims, models, instances) populate this via their
  // dedicated handlers below so the same `ContextMenu` instance is reused.
  const [menu, setMenu] = useState<
    { x: number; y: number; items: ContextMenuItem[] } | null
  >(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const handleContextMenu = useCallback(
    (primId: string, x: number, y: number) => {
      setMenu({
        x,
        y,
        items: [
          { label: 'Duplicate', onClick: () => handleDuplicate(primId) },
          {
            label: 'Delete',
            destructive: true,
            onClick: () => handleDelete(primId)
          }
        ]
      });
    },
    [handleDuplicate, handleDelete]
  );

  // ---------- Ontology mutation handlers ----------

  // Inline-rename state. After creating a new type/instance the new id is
  // placed here so the matching panel row mounts an auto-focused input.
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  const handleAddType = useCallback(
    (parentName: string | null = null) => {
      const existing = new Set(
        (ontologyDoc.model?.entityTypes ?? []).map((t) => t.name)
      );
      const base = DEFAULT_ENTITY_TYPE.name;
      let name = base;
      let n = 2;
      while (existing.has(name)) {
        name = `${base}${n}`;
        n++;
      }
      setOntologyDoc((cur) => {
        let next = addEntityType(cur, name);
        if (parentName) next = addEntityTypeParent(next, name, parentName);
        return next;
      });
      setEditingType(name);
      setSelectedId(null);
      setSelectedMeshUid(null);
      setSubMeshInfo(null);
      setSelectedInstanceId(null);
      setInspectorSelection({ kind: 'model-type', name });
    },
    [ontologyDoc]
  );

  const handleCommitTypeRename = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (trimmed && trimmed !== oldName) {
        setOntologyDoc((cur) => renameEntityType(cur, oldName, trimmed));
      }
      setEditingType(null);
    },
    []
  );
  const handleCancelTypeRename = useCallback(() => setEditingType(null), []);

  const handleReparentType = useCallback(
    (name: string, newParent: string | null) => {
      // Drag-drop is now ADDITIVE: dropping a type onto a new parent appends
      // a HasChild edge (the type may have multiple parents). Root drops are
      // refused at the panel layer via canReparentType, so newParent is
      // always non-null here in practice.
      if (newParent === null) return;
      setOntologyDoc((cur) => addEntityTypeParent(cur, name, newParent));
    },
    []
  );

  // Returns whether a drag-drop reparent of `name` onto `newParent` (null =
  // root) is permitted. Refuses self-drops, cycles, duplicate edges,
  // dragging the hidden USD type, and any root drop (root placement is
  // managed via the context menu "Make root" action, not drag-drop).
  const canReparentType = useCallback(
    (name: string, newParent: string | null): boolean => {
      if (!name) return false;
      if (name === 'USD') return false;
      if (newParent === null) return false;
      if (newParent === name) return false;
      const rels = ontologyDoc.model?.relationships ?? [];
      const exists = rels.some(
        (r) =>
          r.type === 'HasChild' && r.source === newParent && r.target === name
      );
      if (exists) return false;
      // Cycle: walking up from newParent via HasChild ancestors must not
      // reach `name`.
      const parentsOf = new Map<string, string[]>();
      for (const r of rels) {
        if (r.type !== 'HasChild') continue;
        const list = parentsOf.get(r.target) ?? [];
        list.push(r.source);
        parentsOf.set(r.target, list);
      }
      const stack = [newParent];
      const seen = new Set<string>();
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === name) return false;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const p of parentsOf.get(cur) ?? []) stack.push(p);
      }
      return true;
    },
    [ontologyDoc]
  );

  const handleSelectModelType = useCallback((name: string) => {
    setSelectedId(null);
    setSelectedMeshUid(null);
    setSubMeshInfo(null);
    setSelectedInstanceId(null);
    setInspectorSelection({ kind: 'model-type', name });
  }, []);

  const handleSelectModelRelationship = useCallback((index: number) => {
    setSelectedId(null);
    setSelectedMeshUid(null);
    setSubMeshInfo(null);
    setSelectedInstanceId(null);
    setInspectorSelection({ kind: 'model-relationship', index });
  }, []);

  const handleUpdateModelType = useCallback(
    (name: string, patch: Partial<Omit<OntologyEntityType, 'name'>>) => {
      const before = ontologyDoc.model?.entityTypes.find((t) => t.name === name);
      const beforeUsd = (before?.usd ?? '').trim();
      setOntologyDoc((cur) => updateEntityType(cur, name, patch));

      // If the USD field gained a value (or changed to a new value), backfill
      // existing instances of this type by attaching a USD child carrying that
      // path — matching what addEntityInstance does for newly-created ones —
      // and spawn the corresponding prim under the parent's bound USD prim.
      if (!('usd' in patch)) return;
      const nextUsd = (patch.usd ?? '').trim();
      if (!nextUsd || nextUsd === beforeUsd) return;

      const instances = ontologyDoc.instances.entities.filter(
        (e) => e.type === name
      );
      if (instances.length === 0) return;

      const rels = ontologyDoc.instances.relationships;
      const modelRels = ontologyDoc.model?.relationships ?? [];
      const usdRel = modelRels.find(
        (r) => r.type === 'HasUSD' && r.source === name
      );
      const usdType = usdRel?.target ?? 'USD';

      const newEntities: OntologyEntity[] = [];
      const newRels: OntologyRelationship[] = [];
      const newBindings: Record<string, SpatialBinding> = {};
      const takenNames = new Set(
        ontologyDoc.instances.entities.map((e) => e.name)
      );

      for (const inst of instances) {
        const hasUsdChild = rels.some(
          (r) => r.type === 'HasUSD' && r.source === inst.id
        );
        if (hasUsdChild) continue;

        const spatialId = `usd-${Math.random().toString(36).slice(2, 8)}`;
        let candidate = `${inst.name} USD`;
        let n = 1;
        while (takenNames.has(candidate)) {
          candidate = `${inst.name} USD_${n}`;
          n++;
        }
        takenNames.add(candidate);

        newEntities.push({
          id: spatialId,
          type: usdType,
          name: candidate,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          usd: nextUsd,
          topic: '',
          guid: ''
        });
        newRels.push({ type: 'HasUSD', source: inst.id, target: spatialId });

        let parentPrimId: string | null = null;
        const parentChildRel = rels.find(
          (r) => r.type === 'HasChild' && r.target === inst.id
        );
        if (parentChildRel) {
          const parentSpatialId = rels.find(
            (r) => r.type === 'HasUSD' && r.source === parentChildRel.source
          )?.target;
          if (parentSpatialId) {
            parentPrimId = bindings[parentSpatialId]?.guid ?? null;
          }
        }
        const spawned = spawnFromModelUsd(nextUsd, inst.name, parentPrimId);
        if (spawned) {
          newBindings[spatialId] = {
            guid: spawned.guid,
            usd: nextUsd,
            name: spawned.name
          };
        }
      }

      if (newEntities.length === 0) return;
      setOntologyDoc((cur) => {
        const next: OntologyDoc = JSON.parse(JSON.stringify(cur));
        next.instances.entities.push(...newEntities);
        next.instances.relationships.push(...newRels);
        return next;
      });
      setBindings((cur) => ({ ...cur, ...newBindings }));
    },
    [ontologyDoc, bindings, spawnFromModelUsd]
  );

  const handleRenameModelTypeFromProps = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;
      setOntologyDoc((cur) => renameEntityType(cur, oldName, trimmed));
      setInspectorSelection({ kind: 'model-type', name: trimmed });
    },
    []
  );

  const handleUpdateModelRelationship = useCallback(
    (oldRel: OntologyRelationship, nextRel: OntologyRelationship) => {
      setOntologyDoc((cur) => {
        const removed = removeModelRelationship(cur, oldRel);
        return upsertModelRelationship(removed, nextRel);
      });
    },
    []
  );

  // Live entity instance that the Properties panel is editing. Re-resolved
  // from the ontology doc each render so edits flow back into the form.
  const selectedInstance: OntologyEntity | null = useMemo(() => {
    if (!selectedInstanceId) return null;
    return (
      ontologyDoc.instances.entities.find((e) => e.id === selectedInstanceId) ??
      null
    );
  }, [selectedInstanceId, ontologyDoc]);

  // Hidden USD child of the selected non-USD instance, if any. Merged into
  // the Properties form so the parent row visibly owns its USD pose/USD
  // path/topic/guid.
  const selectedInstanceUsdChild: OntologyEntity | null = useMemo(() => {
    if (!selectedInstance || selectedInstance.type === 'USD') return null;
    const rel = ontologyDoc.instances.relationships.find(
      (r) => r.type === 'HasUSD' && r.source === selectedInstance.id
    );
    if (!rel) return null;
    return (
      ontologyDoc.instances.entities.find((e) => e.id === rel.target) ?? null
    );
  }, [selectedInstance, ontologyDoc]);

  // Live prim bound to the selected USD child, if any. Used by the merged
  // USD section in the Properties panel so position/rotation read and write
  // straight through to the viewport — keeping the two sides in lockstep as
  // the gizmo moves or the user types.
  const selectedInstanceUsdChildPrim: PrimNode | null = useMemo(() => {
    if (!selectedInstanceUsdChild) return null;
    const guid = bindings[selectedInstanceUsdChild.id]?.guid;
    if (!guid) return null;
    return prims.find((p) => p.id === guid) ?? null;
  }, [selectedInstanceUsdChild, bindings, prims]);

  // Patch an entity instance. For a USD entity whose `usd` field is
  // changing, also swap the bound prim in the viewport: delete the current
  // prim sub-tree and (if the new USD is non-empty) spawn a fresh one under
  // the same parent, then update the binding so it points at the new prim.
  const handleUpdateEntityInstance = useCallback(
    (id: string, patch: Partial<Omit<OntologyEntity, 'id' | 'type'>>) => {
      const entity = ontologyDoc.instances.entities.find((e) => e.id === id);
      if (!entity) return;
      setOntologyDoc((cur) => updateEntityInstance(cur, id, patch));

      if (!('usd' in patch) || entity.type !== 'USD') return;
      const nextUsd = (patch.usd ?? '').trim();
      const prevUsd = (entity.usd ?? '').trim();
      if (nextUsd === prevUsd) return;

      const existing = bindings[id];
      let parentPrimId: string | null = null;
      if (existing) {
        const oldPrim = prims.find((p) => p.id === existing.guid);
        parentPrimId = oldPrim?.parentId ?? null;
        handleDelete(existing.guid);
      } else {
        // No existing prim — try to place the new one under the bound prim
        // of the parent ontology entity (the one that HasUSD → this id).
        const parentRel = ontologyDoc.instances.relationships.find(
          (r) => r.type === 'HasUSD' && r.target === id
        );
        if (parentRel) {
          const parentSpatialId = ontologyDoc.instances.relationships.find(
            (r) => r.type === 'HasUSD' && r.source === parentRel.source
          )?.target;
          if (parentSpatialId) {
            parentPrimId = bindings[parentSpatialId]?.guid ?? null;
          }
        }
      }

      if (!nextUsd) return;
      const spawned = spawnFromModelUsd(nextUsd, entity.name, parentPrimId);
      if (!spawned) return;
      setBindings((cur) => ({
        ...cur,
        [id]: { guid: spawned.guid, usd: nextUsd, name: spawned.name }
      }));
    },
    [ontologyDoc, bindings, prims, handleDelete, spawnFromModelUsd]
  );

  const handleReparentInstance = useCallback(
    (id: string, newParentId: string | null) => {
      setOntologyDoc((cur) => setEntityInstanceParent(cur, id, newParentId));
    },
    []
  );

  // True iff a drag-drop reparent from `id` onto `newParentId` (null = root)
  // is permitted by the model's HasChild relationships. Used by OntologyPanel
  // to refuse invalid drops and shake the offending row.
  const canReparentInstance = useCallback(
    (id: string, newParentId: string | null): boolean => {
      const entities = ontologyDoc.instances.entities;
      const child = entities.find((e) => e.id === id);
      if (!child) return false;
      const rels = ontologyDoc.model?.relationships ?? [];
      if (newParentId === null) {
        // Root drop is only allowed for types that aren't a HasChild target
        // anywhere in the model (i.e. genuine top-of-hierarchy types).
        const hasChildTargets = new Set(
          rels.filter((r) => r.type === 'HasChild').map((r) => r.target)
        );
        return !hasChildTargets.has(child.type);
      }
      const parent = entities.find((e) => e.id === newParentId);
      if (!parent) return false;
      return rels.some(
        (r) =>
          r.type === 'HasChild' &&
          r.source === parent.type &&
          r.target === child.type
      );
    },
    [ontologyDoc]
  );

  const buildTypePickerSubmenu = useCallback(
    (
      mode: 'root' | 'children' | 'all',
      parentTypeName: string | null,
      onPick: (typeName: string) => void
    ): ContextMenuItem[] => {
      const types = ontologyDoc.model?.entityTypes ?? [];
      const rels = ontologyDoc.model?.relationships ?? [];
      const visible = types.filter((t) => !HIDDEN_ENTITY_TYPE_NAMES.has(t.name));
      let allowed: typeof visible;
      if (mode === 'all') {
        allowed = visible;
      } else if (mode === 'root') {
        // Root pick: only types that are NOT the target of any HasChild
        // edge. Reflects the live model — editing relationships re-narrows
        // the picker on the next open.
        const hasChildTargets = new Set(
          rels.filter((r) => r.type === 'HasChild').map((r) => r.target)
        );
        allowed = visible.filter((t) => !hasChildTargets.has(t.name));
      } else {
        const childTypes = new Set(
          rels
            .filter((r) => r.type === 'HasChild' && r.source === parentTypeName)
            .map((r) => r.target)
        );
        allowed = visible.filter((t) => childTypes.has(t.name));
      }
      if (allowed.length === 0) {
        return [{ label: '(no types available)', disabled: true }];
      }
      return allowed.map((t) => ({
        label: t.name,
        onClick: () => onPick(t.name)
      }));
    },
    [ontologyDoc]
  );

  const addInstanceOfType = useCallback(
    (type: string, parentId: string | null) => {
      const result = addEntityInstance(ontologyDoc, type, type, { parentId });
      setOntologyDoc(result.doc);
      setSelectedId(null);
      setSelectedMeshUid(null);
      setSubMeshInfo(null);
      setInspectorSelection(null);
      setSelectedInstanceId(result.id);
      if (result.spatialId && result.usd) {
        const spatialId = result.spatialId;
        const modelUsd = result.usd;
        const instanceName =
          result.doc.instances.entities.find((e) => e.id === result.id)?.name ??
          type;
        let parentPrimId: string | null = null;
        if (parentId) {
          const parentSpatialId = result.doc.instances.relationships.find(
            (r) => r.type === 'HasUSD' && r.source === parentId
          )?.target;
          if (parentSpatialId) {
            parentPrimId = bindings[parentSpatialId]?.guid ?? null;
          }
        }
        const spawned = spawnFromModelUsd(modelUsd, instanceName, parentPrimId);
        if (spawned) {
          setBindings((cur) => ({
            ...cur,
            [spatialId]: {
              guid: spawned.guid,
              usd: modelUsd,
              name: spawned.name
            }
          }));
        }
      }
    },
    [ontologyDoc, bindings, spawnFromModelUsd]
  );

  const handleCommitInstanceRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (trimmed) {
        setOntologyDoc((cur) => renameEntityInstance(cur, id, trimmed));
      }
      setEditingInstanceId(null);
    },
    []
  );
  const handleCancelInstanceRename = useCallback(
    () => setEditingInstanceId(null),
    []
  );

  const handleAddInstance = useCallback(
    (x: number, y: number) => {
      setMenu({
        x,
        y,
        items: [
          {
            label: 'Add instance',
            submenu: buildTypePickerSubmenu('root', null, (type) =>
              addInstanceOfType(type, null)
            )
          }
        ]
      });
    },
    [buildTypePickerSubmenu, addInstanceOfType]
  );

  const handleModelContextMenu = useCallback(
    (typeName: string, parentName: string | null, x: number, y: number) => {
      if (!typeName) {
        setMenu({
          x,
          y,
          items: [{ label: 'Add type', onClick: () => handleAddType(null) }]
        });
        return;
      }
      const rels = ontologyDoc.model?.relationships ?? [];
      const parents = rels
        .filter((r) => r.type === 'HasChild' && r.target === typeName)
        .map((r) => r.source);
      const detachItems: ContextMenuItem[] = [];
      if (parentName && parents.includes(parentName)) {
        detachItems.push({
          label: `Detach from ${parentName}`,
          onClick: () =>
            setOntologyDoc((cur) =>
              removeEntityTypeParent(cur, typeName, parentName)
            )
        });
      }
      for (const p of parents) {
        if (p === parentName) continue;
        detachItems.push({
          label: `Detach from ${p}`,
          onClick: () =>
            setOntologyDoc((cur) => removeEntityTypeParent(cur, typeName, p))
        });
      }
      if (parents.length > 1) {
        detachItems.push({
          label: 'Make root (clear all parents)',
          onClick: () =>
            setOntologyDoc((cur) => setEntityTypeParent(cur, typeName, null))
        });
      } else if (parents.length === 1 && !parentName) {
        // Defensive fallback: if the panel didn't supply a parent context but
        // the type has exactly one parent, still offer a simple detach.
        detachItems.push({
          label: `Detach from ${parents[0]}`,
          onClick: () =>
            setOntologyDoc((cur) =>
              removeEntityTypeParent(cur, typeName, parents[0])
            )
        });
      }
      setMenu({
        x,
        y,
        items: [
          {
            label: `Add child type under ${typeName}`,
            onClick: () => handleAddType(typeName)
          },
          { label: 'Rename', onClick: () => setEditingType(typeName) },
          {
            label: 'Move up',
            onClick: () =>
              setOntologyDoc((cur) => moveEntityType(cur, typeName, -1))
          },
          {
            label: 'Move down',
            onClick: () =>
              setOntologyDoc((cur) => moveEntityType(cur, typeName, 1))
          },
          ...detachItems,
          {
            label: 'Delete',
            destructive: true,
            onClick: () =>
              setOntologyDoc((cur) => removeEntityType(cur, typeName))
          }
        ]
      });
    },
    [handleAddType, ontologyDoc]
  );

  const handleInstanceContextMenu = useCallback(
    (entityId: string | null, x: number, y: number) => {
      if (!entityId) {
        setMenu({
          x,
          y,
          items: [
            {
              label: 'Add instance',
              submenu: buildTypePickerSubmenu('root', null, (type) =>
                addInstanceOfType(type, null)
              )
            }
          ]
        });
        return;
      }
      const parentEntity = ontologyDoc.instances.entities.find(
        (e) => e.id === entityId
      );
      const parentTypeName = parentEntity?.type ?? null;
      setMenu({
        x,
        y,
        items: [
          {
            label: 'Add child instance',
            submenu: buildTypePickerSubmenu('children', parentTypeName, (type) =>
              addInstanceOfType(type, entityId)
            )
          },
          { label: 'Rename', onClick: () => setEditingInstanceId(entityId) },
          {
            label: 'Delete',
            destructive: true,
            onClick: () => {
              // Collect this entity + all descendants reached via
              // HasChild/HasUSD, so we can drop their viewport prims
              // and bindings in lockstep with the ontology mutation.
              const rels = ontologyDoc.instances.relationships;
              const doomed = new Set<string>([entityId]);
              const stack = [entityId];
              while (stack.length > 0) {
                const cur = stack.pop()!;
                for (const r of rels) {
                  if (
                    (r.type === 'HasChild' || r.type === 'HasUSD') &&
                    r.source === cur &&
                    !doomed.has(r.target)
                  ) {
                    doomed.add(r.target);
                    stack.push(r.target);
                  }
                }
              }
              const primIdsToDelete: string[] = [];
              for (const eid of doomed) {
                const b = bindings[eid];
                if (b?.guid) primIdsToDelete.push(b.guid);
              }
              setOntologyDoc((cur) => removeEntityInstance(cur, entityId));
              setBindings((cur) => {
                let next = cur;
                for (const eid of doomed) {
                  if (eid in next) {
                    if (next === cur) next = { ...cur };
                    delete next[eid];
                  }
                }
                return next;
              });
              for (const pid of primIdsToDelete) handleDelete(pid);
              if (selectedInstanceId && doomed.has(selectedInstanceId)) {
                setSelectedInstanceId(null);
              }
            }
          }
        ]
      });
    },
    [buildTypePickerSubmenu, addInstanceOfType, ontologyDoc, bindings, handleDelete, selectedInstanceId]
  );

  return (
    <div className="layout">
      <TopBar
        sceneName={sceneName}
        onSceneNameChange={setSceneName}
        onExport={handleExport}
        onImport={handleImport}
        theme={theme}
        onThemeChange={setTheme}
      />
      <main className="viewport-area">
        <Viewport
          prims={prims}
          tool={tool}
          selectedId={selectedId}
          selectedMeshUid={selectedMeshUid}
          theme={theme}
          focusSignal={focusSignal}
          snapEnabled={snapEnabled}
          onShapeDropped={handleShapeDropped}
          onAssetDropped={handleAssetDropped}
          onSelect={handleViewportSelect}
          onTransform={handleTransform}
          onAssetMeshesLoaded={handleAssetMeshesLoaded}
          onSubMeshInfoChange={setSubMeshInfo}
          onContextMenu={handleContextMenu}
        />
        <LeftToolbar
          tool={tool}
          onToolChange={setTool}
          onFocus={handleFocus}
          snapEnabled={snapEnabled}
          onSnapToggle={() => setSnapEnabled((v) => !v)}
        />
      </main>
      {false && (
        <HierarchyPanel
          prims={prims}
          selectedId={selectedId}
          selectedMeshUid={selectedMeshUid}
          assetMeshes={assetMeshes}
          mappedByPrimId={mappedByPrimId}
          onSelect={handleSelect}
          onReparent={handleReparent}
          onShapeAdd={handleShapeAddToParent}
          onAssetAdd={handleAssetAddToParent}
          onDelete={handleDelete}
          onContextMenu={handleContextMenu}
        />
      )}
      <PropertiesPanel
        prim={selectedPrim}
        subMesh={subMeshInfo}
        mappedTo={selectedPrim ? mappedByPrimId.get(selectedPrim.id) ?? null : null}
        onUpdate={handleUpdate}
        modelType={selectedModelType}
        modelRelationship={selectedModelRelationship}
        entityInstance={selectedInstance}
        entityUsdChild={selectedInstanceUsdChild}
        entityUsdChildGuid={
          selectedInstanceUsdChild
            ? bindings[selectedInstanceUsdChild.id]?.guid ?? null
            : null
        }
        entityUsdChildPrim={selectedInstanceUsdChildPrim}
        onRenameModelType={handleRenameModelTypeFromProps}
        onUpdateModelType={handleUpdateModelType}
        onUpdateModelRelationship={handleUpdateModelRelationship}
        onUpdateEntityInstance={handleUpdateEntityInstance}
      />
      <div className="left-stack">
        <EntityModelsPanel
          roots={modelRoots}
          modelRelationships={modelRelationships}
          selectedTypeName={
            inspectorSelection?.kind === 'model-type'
              ? inspectorSelection.name
              : null
          }
          selectedRelationshipIndex={
            inspectorSelection?.kind === 'model-relationship'
              ? inspectorSelection.index
              : null
          }
          onAddType={() => handleAddType(null)}
          onSelectType={handleSelectModelType}
          onSelectRelationship={handleSelectModelRelationship}
          onContextMenu={handleModelContextMenu}
          editingName={editingType}
          onCommitRename={handleCommitTypeRename}
          onCancelRename={handleCancelTypeRename}
          onReparent={handleReparentType}
          canReparent={canReparentType}
        />
        <OntologyPanel
          roots={ontology.roots}
          bindings={bindings}
          selectedEntityId={collapseUsdChildToParent(selectedInstanceId ?? selectedEntityId)}
          onBind={handleBind}
          onSelectEntity={handleSelectOntologyEntity}
          resolvePrimAsAsset={resolvePrimAsAsset}
          onAddInstance={handleAddInstance}
          onContextMenu={handleInstanceContextMenu}
          editingId={editingInstanceId}
          onCommitRename={handleCommitInstanceRename}
          onCancelRename={handleCancelInstanceRename}
          onReparent={handleReparentInstance}
          canReparent={canReparentInstance}
        />
      </div>
      <BottomPanel />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={menu.items}
        />
      )}
    </div>
  );
}

function fileSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'scene';
}

// Generate a friendly default scene name: "<Adjective> <Animal>".
const SCENE_NAME_ADJECTIVES = [
  'Brave', 'Bright', 'Calm', 'Cheerful', 'Clever', 'Cosmic', 'Curious',
  'Daring', 'Eager', 'Electric', 'Fancy', 'Fearless', 'Fierce', 'Frosty',
  'Gentle', 'Glowing', 'Golden', 'Happy', 'Jolly', 'Lively', 'Lucky',
  'Mighty', 'Mystic', 'Noble', 'Plucky', 'Quiet', 'Quirky', 'Radiant',
  'Rapid', 'Rustic', 'Shimmering', 'Silent', 'Silly', 'Sleepy', 'Sly',
  'Snazzy', 'Sparkling', 'Speedy', 'Spry', 'Sturdy', 'Sunny', 'Swift',
  'Tame', 'Tiny', 'Vivid', 'Wandering', 'Wild', 'Wise', 'Zany', 'Zesty'
];
const SCENE_NAME_ANIMALS = [
  'Antelope', 'Badger', 'Bear', 'Beaver', 'Bison', 'Buffalo', 'Camel',
  'Caribou', 'Cheetah', 'Coyote', 'Crane', 'Dolphin', 'Eagle', 'Elephant',
  'Elk', 'Falcon', 'Ferret', 'Finch', 'Fox', 'Gazelle', 'Gecko', 'Giraffe',
  'Goose', 'Hare', 'Hawk', 'Heron', 'Hippo', 'Horse', 'Hyena', 'Ibis',
  'Iguana', 'Jaguar', 'Koala', 'Lemur', 'Leopard', 'Lion', 'Lynx', 'Mongoose',
  'Moose', 'Narwhal', 'Ocelot', 'Octopus', 'Orca', 'Otter', 'Owl', 'Panda',
  'Panther', 'Penguin', 'Platypus', 'Puffin', 'Quokka', 'Rabbit', 'Raccoon',
  'Raven', 'Reindeer', 'Rhino', 'Salamander', 'Seal', 'Shark', 'Sloth',
  'Squirrel', 'Stingray', 'Stork', 'Swan', 'Tapir', 'Tiger', 'Toucan',
  'Turtle', 'Walrus', 'Weasel', 'Whale', 'Wolf', 'Wolverine', 'Wombat',
  'Yak', 'Zebra'
];
const SCENE_NAME_NOUNS = [
  'Scene', 'Setting', 'Stage', 'Locale', 'Vista', 'View', 'Tableau',
  'Backdrop', 'Landscape', 'Panorama', 'Scenery', 'Spot', 'Venue', 'Place'
];
function randomSceneName(): string {
  const adj = SCENE_NAME_ADJECTIVES[Math.floor(Math.random() * SCENE_NAME_ADJECTIVES.length)];
  const animal = SCENE_NAME_ANIMALS[Math.floor(Math.random() * SCENE_NAME_ANIMALS.length)];
  const noun = SCENE_NAME_NOUNS[Math.floor(Math.random() * SCENE_NAME_NOUNS.length)];
  return `${adj} ${animal} ${noun}`;
}

// Compute the next free `<base>_<n>` name for a duplicated prim. If the source
// name already ends in `_<n>`, the base is the leading part and we hunt for
// the next free n. Otherwise n starts at 1.
function nextDuplicateName(name: string, taken: Set<string>): string {
  const m = /^(.*)_(\d+)$/.exec(name);
  const base = m ? m[1] : name;
  let n = m ? Number(m[2]) + 1 : 1;
  let candidate = `${base}_${n}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes; not crypto-strong but unique enough.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isDescendant(
  prims: PrimNode[],
  ancestorId: string,
  candidateId: string
): boolean {
  let cur: PrimNode | undefined = prims.find((p) => p.id === candidateId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    if (!cur.parentId) return false;
    const nextId: string = cur.parentId;
    cur = prims.find((p) => p.id === nextId);
  }
  return false;
}

// World matrix for a prim by composing local TRS up the parent chain.
function getWorldMatrix(prims: PrimNode[], id: string): Matrix {
  const chain: PrimNode[] = [];
  let cur: PrimNode | undefined = prims.find((p) => p.id === id);
  while (cur) {
    chain.unshift(cur);
    if (!cur.parentId) break;
    const nextId: string = cur.parentId;
    cur = prims.find((p) => p.id === nextId);
  }
  let m = Matrix.Identity();
  for (const p of chain) {
    m = localMatrix(p).multiply(m);
  }
  return m;
}

function localMatrix(p: PrimNode): Matrix {
  const q = Quaternion.FromEulerAngles(
    p.rotation[0],
    p.rotation[1],
    p.rotation[2]
  );
  return Matrix.Compose(
    new Vector3(p.scale[0], p.scale[1], p.scale[2]),
    q,
    new Vector3(p.position[0], p.position[1], p.position[2])
  );
}

function invertMatrix(m: Matrix): Matrix {
  const inv = new Matrix();
  m.invertToRef(inv);
  return inv;
}

function decomposeMatrix(m: Matrix): {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
} {
  const s = new Vector3();
  const q = new Quaternion();
  const t = new Vector3();
  m.decompose(s, q, t);
  const e = q.toEulerAngles();
  return {
    position: [t.x, t.y, t.z],
    rotation: [e.x, e.y, e.z],
    scale: [s.x, s.y, s.z]
  };
}
