import { useCallback, useEffect, useRef, useState } from 'react';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import BottomPanel from './components/BottomPanel';
import HierarchyPanel from './components/HierarchyPanel';
import LeftToolbar from './components/LeftToolbar';
import PropertiesPanel from './components/PropertiesPanel';
import TopBar, { type Theme } from './components/TopBar';
import Viewport from './components/Viewport';
import { getAsset } from './assets';
import { exportToUsda, parseUsda } from './usd';
import type {
  PrimNode,
  PrimPatch,
  PrimTransform,
  ShapeKind,
  ToolMode,
  Vec3
} from './types';

const KIND_LABELS: Record<ShapeKind, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  plane: 'Plane',
  cone: 'Cone',
  group: 'Group',
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

export default function App() {
  const [prims, setPrims] = useState<PrimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolMode>('move');
  const [sceneName, setSceneName] = useState<string>('Untitled Scene');
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
      return prev.filter((p) => !doomed.has(p.id));
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const selectedPrim =
    selectedId ? prims.find((p) => p.id === selectedId) ?? null : null;

  const handleExport = useCallback(() => {
    const usda = exportToUsda(prims, sceneName);
    const blob = new Blob([usda], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileSafe(sceneName)}.usda`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [prims, sceneName]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const scene = parseUsda(text);
      setPrims(scene.prims);
      setSelectedId(null);
      const nameFromFile = file.name.replace(/\.(usda?|txt)$/i, '');
      setSceneName(nameFromFile || scene.sceneName || 'Imported Scene');
      // Reset auto-name counters so future drops don't collide with imported names.
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
      console.error('USD import failed', err);
      alert('Could not import that file. Expected a .usda scene exported by drewscenes.');
    }
  }, []);

  // Spawn an asset's prim tree at a viewport drop point. Wrap everything in a
  // single Group prim positioned at the drop point so the asset shows up as one
  // movable object in the hierarchy. The group's name is the asset's top-level
  // Xform name from the USDA (or the asset id if missing).
  const handleAssetDropped = useCallback(
    (assetId: string, dropAt: Vec3) => {
      const asset = getAsset(assetId);
      if (!asset) return;
      let parsed;
      try {
        parsed = parseUsda(asset.usda);
      } catch (err) {
        console.error('Asset parse failed', assetId, err);
        return;
      }
      if (parsed.prims.length === 0) return;

      const groupId = newId();
      const groupPrim: PrimNode = {
        id: groupId,
        name: parsed.sceneName || asset.label,
        kind: 'group',
        position: dropAt,
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        parentId: null,
        color: DEFAULT_COLOR
      };
      // Reparent the asset's roots under our new group; leave their local
      // transforms untouched so the geometry composes correctly under the group.
      const newPrims: PrimNode[] = parsed.prims.map((p) =>
        p.parentId === null ? { ...p, parentId: groupId } : p
      );

      setPrims((prev) => [...prev, groupPrim, ...newPrims]);
      setSelectedId(groupId);
    },
    []
  );

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
      <LeftToolbar tool={tool} onToolChange={setTool} onFocus={handleFocus} />
      <main className="viewport-area">
        <Viewport
          prims={prims}
          tool={tool}
          selectedId={selectedId}
          theme={theme}
          focusSignal={focusSignal}
          onShapeDropped={handleShapeDropped}
          onAssetDropped={handleAssetDropped}
          onSelect={setSelectedId}
          onTransform={handleTransform}
        />
      </main>
      <HierarchyPanel
        prims={prims}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onReparent={handleReparent}
        onShapeAdd={handleShapeAddToParent}
        onDelete={handleDelete}
      />
      <PropertiesPanel prim={selectedPrim} onUpdate={handleUpdate} />
      <BottomPanel />
    </div>
  );
}

function fileSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'scene';
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
