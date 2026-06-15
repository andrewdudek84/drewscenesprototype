import { useEffect, useRef, useState } from 'react';
import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GizmoManager,
  HemisphericLight,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointerEventTypes,
  Quaternion,
  Scene,
  SceneLoader,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  type LinesMesh
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/OBJ';
import { OBJFileLoader } from '@babylonjs/loaders/OBJ';
import type { IPositionGizmo, IRotationGizmo, IScaleGizmo } from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';
import type { PrimNode, PrimTransform, ShapeKind, ToolMode } from '../types';
import { ASSET_DRAG_MIME, SHAPE_DRAG_MIME } from '../shapes';
import { resolveAssetUrl } from '../assets';
import CameraControls, { type CameraView } from './CameraControls';

// Tune OBJ loader defaults once at module load:
// - OPTIMIZE_WITH_UV=true (the default) merges vertices across smoothing
//   groups and breaks shading on dense meshes (e.g. the hospital bed).
// - COMPUTE_NORMALS recomputes normals from face geometry, sidestepping any
//   bad/incomplete `vn` data in exported OBJs.
// - OPTIMIZE_NORMALS averages duplicated normals so the recomputed shading
//   stays smooth across the merged vertex set.
OBJFileLoader.OPTIMIZE_WITH_UV = false;
OBJFileLoader.COMPUTE_NORMALS = true;
OBJFileLoader.OPTIMIZE_NORMALS = true;

interface Props {
  prims: PrimNode[];
  tool: ToolMode;
  selectedId: string | null;
  theme: 'dark' | 'light';
  /** Bump to reset the camera to its initial view (Focus button / F hotkey). */
  focusSignal: number;
  onShapeDropped: (kind: ShapeKind, position: [number, number, number]) => void;
  onAssetDropped: (assetId: string, position: [number, number, number]) => void;
  onSelect: (id: string | null) => void;
  onTransform: (id: string, t: Partial<PrimTransform>) => void;
}

// Translation snap = the grid's minor tick (FR-14.3 in the spec: 1 m).
const POSITION_SNAP = 1;
// Rotation snap = 5 degrees per drag tick.
const ROTATION_SNAP = (5 * Math.PI) / 180;
// Scale snap kept fine-grained; not asked for explicitly but matches the move-snap feel.
const SCALE_SNAP = 0.25;
const SELECTION_COLOR = new Color4(0.35, 0.7, 1, 0.6);
const SELECTION_EDGE_WIDTH = 3;

// Match the origin axis lines below so gizmo colors read as the same axes.
const AXIS_COLORS = {
  x: new Color3(0.85, 0.25, 0.25),
  y: new Color3(0.3, 0.85, 0.35),
  z: new Color3(0.3, 0.55, 0.95)
} as const;

export default function Viewport({
  prims,
  tool,
  selectedId,
  theme,
  focusSignal,
  onShapeDropped,
  onAssetDropped,
  onSelect,
  onTransform
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundRef = useRef<Mesh | null>(null);
  const gridMatRef = useRef<GridMaterial | null>(null);
  const meshesRef = useRef<Map<string, Mesh>>(new Map());
  const materialsRef = useRef<Map<string, StandardMaterial>>(new Map());
  const gizmoMgrRef = useRef<GizmoManager | null>(null);
  const ensureSnapRef = useRef<() => void>(() => {});
  const lastPositionGizmoRef = useRef<IPositionGizmo | null>(null);
  const lastRotationGizmoRef = useRef<IRotationGizmo | null>(null);
  const lastScaleGizmoRef = useRef<IScaleGizmo | null>(null);

  // Tool mode tracked in a ref so the once-attached pointer observable can
  // branch on the current tool without being re-attached.
  const toolRef = useRef<ToolMode>(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // Measurement tool state. start/end are world-space points; null means
  // "waiting for that click". Visuals (spheres, dashed line) are owned by
  // refs so the once-attached pointer/render listeners can update them
  // without React re-renders.
  const measureRef = useRef<{
    start: Vector3 | null;
    end: Vector3 | null;
    committed: boolean;
  }>({ start: null, end: null, committed: false });
  const measureStartSphereRef = useRef<Mesh | null>(null);
  const measureEndSphereRef = useRef<Mesh | null>(null);
  const measureLineRef = useRef<LinesMesh | null>(null);
  const measureLabelRef = useRef<HTMLDivElement | null>(null);
  const clearMeasurementRef = useRef<() => void>(() => {});

  const [cameraView, setCameraView] = useState<CameraView>('perspective');

  // Latest callbacks captured so the once-attached listeners always see fresh state.
  const onDropRef = useRef(onShapeDropped);
  const onAssetDropRef = useRef(onAssetDropped);
  const onSelectRef = useRef(onSelect);
  const onTransformRef = useRef(onTransform);
  useEffect(() => {
    onDropRef.current = onShapeDropped;
  }, [onShapeDropped]);
  useEffect(() => {
    onAssetDropRef.current = onAssetDropped;
  }, [onAssetDropped]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onTransformRef.current = onTransform;
  }, [onTransform]);

  // One-time scene setup.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true
    });

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.1, 0.11, 0.13, 1);
    sceneRef.current = scene;

    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 4,
      Math.PI / 3,
      25,
      Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 5000;
    camera.wheelDeltaPercentage = 0.02;
    camera.panningSensibility = 80;
    // Allow orbiting under the floor.
    camera.lowerBetaLimit = -Math.PI;
    camera.upperBetaLimit = Math.PI;
    camera.allowUpsideDown = true;
    cameraRef.current = camera;
    engineRef.current = engine;

    // Keep orthographic bounds in sync with the camera's current radius so
    // the wheel-zoom still feels natural in top/side views.
    scene.onBeforeRenderObservable.add(() => {
      if (camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) return;
      const aspect = engine.getAspectRatio(camera);
      const half = camera.radius * 0.5;
      camera.orthoTop = half;
      camera.orthoBottom = -half;
      camera.orthoLeft = -half * aspect;
      camera.orthoRight = half * aspect;
    });

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 1.1;
    hemi.diffuse = new Color3(1, 1, 1);
    hemi.groundColor = new Color3(0.35, 0.38, 0.45);

    const key = new DirectionalLight('key', new Vector3(-0.5, -1, -0.4), scene);
    key.intensity = 1.2;
    key.diffuse = new Color3(1, 0.98, 0.94);

    const groundSize = 10000;
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: groundSize, height: groundSize, subdivisions: 1 },
      scene
    );
    groundRef.current = ground;

    const grid = new GridMaterial('gridMat', scene);
    grid.majorUnitFrequency = 10;
    grid.minorUnitVisibility = 0.35;
    grid.gridRatio = 1;
    grid.mainColor = new Color3(0.1, 0.11, 0.13);
    grid.lineColor = new Color3(0.6, 0.65, 0.75);
    grid.opacity = 0.25;
    grid.backFaceCulling = false;
    ground.material = grid;
    ground.alphaIndex = 0;
    gridMatRef.current = grid;

    const axisLength = 2;
    const xAxis = MeshBuilder.CreateLines(
      'xAxis',
      { points: [new Vector3(0, 0.001, 0), new Vector3(axisLength, 0.001, 0)] },
      scene
    );
    xAxis.color = new Color3(0.85, 0.25, 0.25);
    xAxis.isPickable = false;

    const zAxis = MeshBuilder.CreateLines(
      'zAxis',
      { points: [new Vector3(0, 0.001, 0), new Vector3(0, 0.001, axisLength)] },
      scene
    );
    zAxis.color = new Color3(0.3, 0.55, 0.95);
    zAxis.isPickable = false;

    const yAxis = MeshBuilder.CreateLines(
      'yAxis',
      { points: [new Vector3(0, 0.001, 0), new Vector3(0, axisLength, 0)] },
      scene
    );
    yAxis.color = new Color3(0.3, 0.85, 0.35);
    yAxis.isPickable = false;

    // Selection is driven by us (click in viewport or in the hierarchy panel),
    // not by the gizmo manager's own pointer handling.
    const gizmoMgr = new GizmoManager(scene);
    gizmoMgr.usePointerToAttachGizmos = false;
    gizmoMgr.positionGizmoEnabled = false;
    gizmoMgr.rotationGizmoEnabled = false;
    gizmoMgr.scaleGizmoEnabled = false;
    gizmoMgrRef.current = gizmoMgr;

    const commitFromMesh = () => {
      const m = gizmoMgr.attachedMesh;
      if (!m) return;
      const id = (m.metadata as { primId?: string } | undefined)?.primId;
      if (!id) return;
      // Meshes always carry a rotationQuaternion (see reconcile), since the
      // RotationGizmo only manipulates the quaternion. Convert it back to
      // Euler radians for our state model.
      const e = m.rotationQuaternion
        ? m.rotationQuaternion.toEulerAngles()
        : m.rotation;
      onTransformRef.current(id, {
        position: [m.position.x, m.position.y, m.position.z],
        rotation: [e.x, e.y, e.z],
        scale: [m.scaling.x, m.scaling.y, m.scaling.z]
      });
    };

    // Gizmos are lazily (re-)created when the manager enables them, so we
    // re-apply snap and hook the commit callback whenever a new gizmo instance shows up.
    ensureSnapRef.current = () => {
      const p = gizmoMgr.gizmos.positionGizmo;
      if (p && p !== lastPositionGizmoRef.current) {
        p.snapDistance = POSITION_SNAP;
        p.onDragEndObservable.add(commitFromMesh);
        lastPositionGizmoRef.current = p;
      }
      const r = gizmoMgr.gizmos.rotationGizmo;
      if (r && r !== lastRotationGizmoRef.current) {
        r.snapDistance = ROTATION_SNAP;
        // Keep the rings on world axes. Babylon refuses to track an attached
        // mesh's rotation when its scale is non-uniform and the drag stops
        // responding; world-aligned rings sidestep that entirely.
        r.updateGizmoRotationToMatchAttachedMesh = false;
        r.onDragEndObservable.add(commitFromMesh);
        lastRotationGizmoRef.current = r;
      }
      const s = gizmoMgr.gizmos.scaleGizmo;
      if (s && s !== lastScaleGizmoRef.current) {
        s.snapDistance = SCALE_SNAP;
        // Make the drag-to-scale ratio track mouse travel ~1:1 instead of
        // Babylon's default fractional response.
        s.sensitivity = 4;
        s.onDragEndObservable.add(commitFromMesh);
        lastScaleGizmoRef.current = s;
      }
      // Tint runs every time because gizmo subtrees lazily mount their handle
      // meshes; an early one-shot may run before the geometry exists.
      if (p) tintGizmoAxes(p);
      if (r) tintGizmoAxes(r);
      if (s) tintGizmoAxes(s);
    };

    // Pick that snaps to the nearest bounding-box corner of the picked mesh
    // if one is within ~0.5 m of the surface point. Falls back to the raw
    // surface point (or the floor pick). Returns null if nothing was hit.
    const pickMeasurePoint = (): Vector3 | null => {
      const p = scene.pick(scene.pointerX, scene.pointerY);
      if (!p?.hit || !p.pickedPoint) return null;
      const pt = p.pickedPoint;
      const m = p.pickedMesh;
      if (!m || m === ground) return pt.clone();
      const bb = m.getBoundingInfo().boundingBox;
      const corners = bb.vectorsWorld;
      const SNAP = 0.5;
      let best: Vector3 | null = null;
      let bestD = SNAP;
      for (const c of corners) {
        const d = Vector3.Distance(c, pt);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return (best ?? pt).clone();
    };

    const rebuildMeasureLine = () => {
      const { start, end } = measureRef.current;
      if (measureLineRef.current) {
        measureLineRef.current.dispose();
        measureLineRef.current = null;
      }
      if (!start || !end) return;
      const line = MeshBuilder.CreateDashedLines(
        'measure-line',
        {
          points: [start, end],
          dashSize: 6,
          gapSize: 4,
          dashNb: Math.max(20, Math.floor(Vector3.Distance(start, end) * 8))
        },
        scene
      );
      line.color = new Color3(1, 0.84, 0.27);
      line.isPickable = false;
      line.renderingGroupId = 1;
      measureLineRef.current = line;
    };

    const setMeasureSphere = (
      ref: React.MutableRefObject<Mesh | null>,
      pos: Vector3 | null,
      name: string
    ) => {
      if (!pos) {
        if (ref.current) {
          ref.current.dispose();
          ref.current = null;
        }
        return;
      }
      if (!ref.current) {
        const sphere = MeshBuilder.CreateSphere(name, { diameter: 0.18 }, scene);
        sphere.isPickable = false;
        sphere.renderingGroupId = 1;
        const mat = new StandardMaterial(`${name}-mat`, scene);
        mat.emissiveColor = new Color3(1, 0.84, 0.27);
        mat.disableLighting = true;
        sphere.material = mat;
        ref.current = sphere;
      }
      ref.current.position.copyFrom(pos);
    };

    clearMeasurementRef.current = () => {
      measureRef.current = { start: null, end: null, committed: false };
      setMeasureSphere(measureStartSphereRef, null, 'measure-start');
      setMeasureSphere(measureEndSphereRef, null, 'measure-end');
      if (measureLineRef.current) {
        measureLineRef.current.dispose();
        measureLineRef.current = null;
      }
      if (measureLabelRef.current) measureLabelRef.current.style.display = 'none';
    };

    scene.onPointerObservable.add((info) => {
      // Measurement mode owns clicks: don't select/deselect prims here.
      if (toolRef.current === 'measure') {
        if (info.type === PointerEventTypes.POINTERTAP) {
          const ev = info.event as PointerEvent;
          if (ev.button !== 0) return;
          const pt = pickMeasurePoint();
          if (!pt) return;
          const cur = measureRef.current;
          if (cur.committed) {
            // Third click: restart with a fresh start point.
            measureRef.current = { start: pt, end: null, committed: false };
            setMeasureSphere(measureStartSphereRef, pt, 'measure-start');
            setMeasureSphere(measureEndSphereRef, null, 'measure-end');
            rebuildMeasureLine();
          } else if (!cur.start) {
            measureRef.current = { start: pt, end: null, committed: false };
            setMeasureSphere(measureStartSphereRef, pt, 'measure-start');
          } else {
            measureRef.current = { start: cur.start, end: pt, committed: true };
            setMeasureSphere(measureEndSphereRef, pt, 'measure-end');
            rebuildMeasureLine();
          }
        } else if (info.type === PointerEventTypes.POINTERMOVE) {
          // While the user is choosing the second point, show a live preview
          // line + label from start to the cursor. Stop previewing once the
          // end point is committed by a click.
          const cur = measureRef.current;
          if (!cur.start || cur.committed) return;
          const pt = pickMeasurePoint();
          if (!pt) return;
          measureRef.current = { start: cur.start, end: pt, committed: false };
          rebuildMeasureLine();
          // Leave measureEndSphereRef hidden during preview so the user can
          // still see which click "locks in" the measurement.
        }
        return;
      }

      if (info.type !== PointerEventTypes.POINTERTAP) return;
      const ev = info.event as PointerEvent;
      if (ev.button !== 0) return;
      const pick = info.pickInfo;
      if (!pick?.hit) {
        onSelectRef.current(null);
        return;
      }
      const m = pick.pickedMesh;
      if (m === ground) {
        onSelectRef.current(null);
        return;
      }
      const id = (m?.metadata as { primId?: string } | undefined)?.primId;
      if (id) {
        onSelectRef.current(id);
      }
      // Otherwise we probably tapped a gizmo handle; leave selection alone.
    });

    // Render-loop hook: project the measurement midpoint to screen space
    // and place the HTML label there. Hide the label when there is no live
    // measurement.
    scene.onBeforeRenderObservable.add(() => {
      const label = measureLabelRef.current;
      if (!label) return;
      const { start, end } = measureRef.current;
      if (!start || !end) {
        label.style.display = 'none';
        return;
      }
      const mid = Vector3.Center(start, end);
      const cam = cameraRef.current;
      if (!cam) {
        label.style.display = 'none';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const screen = Vector3.Project(
        mid,
        Matrix.Identity(),
        scene.getTransformMatrix(),
        cam.viewport.toGlobal(rect.width, rect.height)
      );
      label.style.display = 'block';
      label.style.left = `${screen.x}px`;
      label.style.top = `${screen.y}px`;
      const d = Vector3.Distance(start, end);
      label.textContent = `${d.toFixed(2)} m`;
    });

    engine.runRenderLoop(() => scene.render());

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // HTML5 drop wiring: drop on the canvas, pick the ground at the cursor,
    // hand the world position back so a prim can be appended to the model.
    const onDragOver = (ev: DragEvent) => {
      const types = ev.dataTransfer?.types;
      if (!types) return;
      if (types.includes(SHAPE_DRAG_MIME) || types.includes(ASSET_DRAG_MIME)) {
        ev.preventDefault();
        ev.dataTransfer!.dropEffect = 'copy';
      }
    };
    const onDrop = (ev: DragEvent) => {
      const dt = ev.dataTransfer;
      if (!dt) return;
      const assetId = dt.getData(ASSET_DRAG_MIME);
      const shapeKind = dt.getData(SHAPE_DRAG_MIME) as ShapeKind | '';
      if (!assetId && !shapeKind) return;
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const pick = scene.pick(x, y, (m) => m === ground);
      const p = pick?.pickedPoint ?? Vector3.Zero();
      if (assetId) {
        onAssetDropRef.current(assetId, [p.x, 0, p.z]);
      } else if (shapeKind) {
        onDropRef.current(shapeKind, [p.x, 0, p.z]);
      }
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    return () => {
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', onDrop);
      window.removeEventListener('resize', onResize);
      meshesRef.current.clear();
      materialsRef.current.clear();
      sceneRef.current = null;
      groundRef.current = null;
      cameraRef.current = null;
      engineRef.current = null;
      gizmoMgrRef.current = null;
      lastPositionGizmoRef.current = null;
      lastRotationGizmoRef.current = null;
      lastScaleGizmoRef.current = null;
      gridMatRef.current = null;
      measureStartSphereRef.current = null;
      measureEndSphereRef.current = null;
      measureLineRef.current = null;
      gizmoMgr.dispose();
      engine.dispose();
    };
  }, []);

  // Reconcile meshes with the prim list: ensure mesh exists, sync transforms,
  // material color, and parent linkage.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const existingMeshes = meshesRef.current;
    const existingMats = materialsRef.current;
    const seen = new Set<string>();

    // Pass 1: create/update meshes + materials + transforms.
    for (const prim of prims) {
      seen.add(prim.id);
      let mesh = existingMeshes.get(prim.id);
      if (!mesh) {
        mesh = buildShapeMesh(prim, scene);
        existingMeshes.set(prim.id, mesh);
      } else if (prim.kind === 'reference') {
        // Reload the GLB if the user edited the source path.
        const meta = mesh.metadata as
          | { primId?: string; loadedSource?: string }
          | undefined;
        if ((meta?.loadedSource ?? '') !== (prim.assetSource ?? '')) {
          for (const child of mesh.getChildMeshes(false)) child.dispose();
          mesh.metadata = { primId: prim.id };
          if (prim.assetSource) {
            void loadGltfReference(mesh, prim.assetSource, scene, prim.id);
          }
        }
      }
      mesh.position.set(prim.position[0], prim.position[1], prim.position[2]);
      // Drive rotation via quaternion only — the RotationGizmo writes to
      // rotationQuaternion, and a non-null quaternion takes precedence over
      // mesh.rotation in Babylon's world-matrix composition.
      const q = Quaternion.FromEulerAngles(
        prim.rotation[0],
        prim.rotation[1],
        prim.rotation[2]
      );
      if (mesh.rotationQuaternion) {
        mesh.rotationQuaternion.copyFrom(q);
      } else {
        mesh.rotationQuaternion = q;
      }
      mesh.scaling.set(prim.scale[0], prim.scale[1], prim.scale[2]);

      let mat = existingMats.get(prim.id);
      if (!mat) {
        mat = new StandardMaterial(`mat-${prim.id}`, scene);
        mat.specularColor = new Color3(0.15, 0.15, 0.15);
        existingMats.set(prim.id, mat);
      }
      mat.diffuseColor = hexToColor3(prim.color);
      // Reference prims carry their own PBR materials from the GLB; don't
      // overwrite them with our flat color.
      if (prim.kind !== 'reference') {
        mesh.material = mat;
      }
    }

    // Pass 2: wire up parents now that every mesh exists.
    for (const prim of prims) {
      const mesh = existingMeshes.get(prim.id);
      if (!mesh) continue;
      const parent = prim.parentId
        ? existingMeshes.get(prim.parentId) ?? null
        : null;
      if (mesh.parent !== parent) {
        mesh.parent = parent;
      }
    }

    // Pass 3: dispose meshes/materials whose prims are gone.
    const mgr = gizmoMgrRef.current;
    for (const [id, mesh] of existingMeshes) {
      if (seen.has(id)) continue;
      if (mgr?.attachedMesh === mesh) mgr.attachToMesh(null);
      mesh.dispose();
      existingMeshes.delete(id);
      const mat = existingMats.get(id);
      if (mat) {
        mat.dispose();
        existingMats.delete(id);
      }
    }
  }, [prims]);

  // Selection + tool sync: solid outline on selected mesh, gizmo wiring.
  useEffect(() => {
    const mgr = gizmoMgrRef.current;
    if (!mgr) return;

    // Clear edges on every mesh.
    for (const m of meshesRef.current.values()) {
      if (m.edgesRenderer) m.disableEdgesRendering();
    }

    const selectedMesh = selectedId
      ? meshesRef.current.get(selectedId) ?? null
      : null;

    if (selectedMesh) {
      selectedMesh.enableEdgesRendering();
      selectedMesh.edgesWidth = SELECTION_EDGE_WIDTH;
      selectedMesh.edgesColor = SELECTION_COLOR;
    }

    const wantMove = tool === 'move' && !!selectedMesh;
    const wantRotate = tool === 'rotate' && !!selectedMesh;
    const wantScale = tool === 'scale' && !!selectedMesh;
    mgr.positionGizmoEnabled = wantMove;
    mgr.rotationGizmoEnabled = wantRotate;
    mgr.scaleGizmoEnabled = wantScale;
    ensureSnapRef.current();
    mgr.attachToMesh(selectedMesh);
  }, [selectedId, tool, prims]);

  // Measure tool side-effects: swap the canvas cursor for a crosshair and
  // clear any in-flight measurement when the user switches away.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = tool === 'measure' ? 'crosshair' : '';
    if (tool !== 'measure') clearMeasurementRef.current();
  }, [tool]);

  // Apply a camera-view preset whenever the user picks one in the overlay.
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    applyCameraView(camera, cameraView);
  }, [cameraView]);

  // Focus = reset camera to the same alpha/beta/radius/target the scene
  // started with, and snap the view selector back to perspective.
  useEffect(() => {
    if (focusSignal === 0) return;
    const camera = cameraRef.current;
    if (!camera) return;
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.alpha = Math.PI / 4;
    camera.beta = Math.PI / 3;
    camera.radius = 25;
    camera.target.copyFromFloats(0, 0, 0);
    setCameraView('perspective');
  }, [focusSignal]);

  // Re-tint scene background + grid colors when the app theme changes.
  useEffect(() => {
    const scene = sceneRef.current;
    const grid = gridMatRef.current;
    if (!scene || !grid) return;
    if (theme === 'light') {
      scene.clearColor = new Color4(0.94, 0.95, 0.97, 1);
      grid.mainColor = new Color3(0.94, 0.95, 0.97);
      grid.lineColor = new Color3(0.35, 0.4, 0.5);
    } else {
      scene.clearColor = new Color4(0.1, 0.11, 0.13, 1);
      grid.mainColor = new Color3(0.1, 0.11, 0.13);
      grid.lineColor = new Color3(0.6, 0.65, 0.75);
    }
  }, [theme]);

  return (
    <div className="viewport-canvas-wrap">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div
        ref={measureLabelRef}
        className="measure-label"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <CameraControls view={cameraView} onChange={setCameraView} />
    </div>
  );
}

function buildShapeMesh(prim: PrimNode, scene: Scene): Mesh {
  let mesh: Mesh;
  switch (prim.kind) {
    case 'box':
      mesh = MeshBuilder.CreateBox(prim.id, { size: 1 }, scene);
      break;
    case 'cylinder':
      mesh = MeshBuilder.CreateCylinder(
        prim.id,
        { diameter: 1, height: 1 },
        scene
      );
      break;
    case 'sphere':
      mesh = MeshBuilder.CreateSphere(prim.id, { diameter: 1 }, scene);
      break;
    case 'plane':
      mesh = MeshBuilder.CreateGround(
        prim.id,
        { width: 1, height: 1 },
        scene
      );
      break;
    case 'cone':
      mesh = MeshBuilder.CreateCylinder(
        prim.id,
        { diameterTop: 0, diameterBottom: 1, height: 1, tessellation: 32 },
        scene
      );
      break;
    case 'group':
      // An empty Mesh acts as a pure transform node: children parent to it,
      // and the gizmo can attach to it, but it has no geometry to render.
      mesh = new Mesh(prim.id, scene);
      mesh.isPickable = false;
      break;
    case 'reference':
      // Empty parent transform; the GLB's meshes get parented under it once
      // the async glTF load completes.
      mesh = new Mesh(prim.id, scene);
      mesh.isPickable = false;
      if (prim.assetSource) {
        void loadGltfReference(mesh, prim.assetSource, scene, prim.id);
      }
      break;
  }
  mesh.metadata = { primId: prim.id };
  // Initialize rotation as a quaternion so the rotation gizmo has something
  // to drive; the reconcile effect keeps it in sync from state.
  mesh.rotationQuaternion = Quaternion.Identity();
  return mesh;
}

function hexToColor3(hex: string): Color3 {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return new Color3(0.7, 0.7, 0.72);
  const v = parseInt(m[1], 16);
  return new Color3(
    ((v >> 16) & 0xff) / 255,
    ((v >> 8) & 0xff) / 255,
    (v & 0xff) / 255
  );
}

async function loadGltfReference(
  parent: Mesh,
  assetSource: string,
  scene: Scene,
  primId: string
): Promise<void> {
  const url = resolveAssetUrl(assetSource);
  // SceneLoader needs rootUrl + filename split so sibling files (e.g. an OBJ's
  // .mtl and textures) resolve against the same directory.
  const lastSlash = url.lastIndexOf('/');
  const rootUrl = url.slice(0, lastSlash + 1);
  const fileName = url.slice(lastSlash + 1);
  try {
    const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene);
    // The reference prim may have been removed before the load finished.
    if (parent.isDisposed()) {
      for (const m of result.meshes) m.dispose();
      return;
    }
    for (const m of result.meshes) {
      if (!m.parent) m.parent = parent;
      // Tag every loaded mesh so viewport clicks resolve back to the prim.
      m.metadata = { ...(m.metadata ?? {}), primId };
      // Force triangle rendering in case the loader left a non-triangle
      // fillMode behind (some OBJ paths default to point cloud when index
      // generation goes wrong).
      if (m instanceof Mesh) {
        if (m.material) m.material.fillMode = Material.TriangleFillMode;
        if (
          !m.isVerticesDataPresent(VertexBuffer.NormalKind) &&
          m.getTotalVertices() > 0 &&
          m.getTotalIndices() > 0
        ) {
          m.createNormals(true);
        }
      }
      sanitizeReferenceMaterial(m.material);
    }
    // Remember which source produced these children so a later edit triggers a reload.
    parent.metadata = { ...(parent.metadata ?? {}), primId, loadedSource: assetSource };
  } catch (err) {
    console.error(`Failed to load reference ${assetSource}`, err);
  }
}

// PNG textures often carry an alpha channel even when fully opaque, and the
// MTL loader can wire one to the diffuse slot — which makes Babylon's
// StandardMaterial render the whole surface translucent. Likewise the OBJ
// loader leaves backface culling on, which combined with reversed winding
// makes faces vanish. Lock things to opaque + double-sided so neither path
// silently hides the geometry.
function sanitizeReferenceMaterial(mat: Material | null): void {
  if (!mat) return;
  mat.backFaceCulling = false;
  mat.transparencyMode = Material.MATERIAL_OPAQUE;
  if (mat instanceof StandardMaterial) {
    mat.useAlphaFromDiffuseTexture = false;
    if (mat.diffuseTexture) mat.diffuseTexture.hasAlpha = false;
    mat.alpha = 1;
  } else if (mat instanceof PBRMaterial) {
    if (mat.albedoTexture) mat.albedoTexture.hasAlpha = false;
    mat.useAlphaFromAlbedoTexture = false;
    mat.alpha = 1;
  }
}

// Babylon's per-axis gizmos expose their materials as protected/internal, so
// we type-erase to recolor consistently across position / rotation / scale.
interface AxisLikeGizmo {
  xGizmo: unknown;
  yGizmo: unknown;
  zGizmo: unknown;
}

function tintGizmoAxes(gizmo: AxisLikeGizmo): void {
  applyAxisColor(gizmo.xGizmo, AXIS_COLORS.x);
  applyAxisColor(gizmo.yGizmo, AXIS_COLORS.y);
  applyAxisColor(gizmo.zGizmo, AXIS_COLORS.z);
}

type MaybeMat =
  | (StandardMaterial & { emissiveColor: Color3; diffuseColor: Color3 })
  | null
  | undefined;
type MaybeMesh = (Mesh & { color?: Color3 }) | null | undefined;

function applyAxisColor(axisGizmo: unknown, color: Color3): void {
  // Cast through unknown: Babylon's IAxisDragGizmo / IPlaneRotationGizmo /
  // IAxisScaleGizmo interfaces don't expose the inner materials, but the
  // concrete classes do (both as public getters and private fields).
  const g = axisGizmo as {
    coloredMaterial?: MaybeMat;
    hoverMaterial?: MaybeMat;
    _coloredMaterial?: MaybeMat;
    _hoverMaterial?: MaybeMat;
    _rootMesh?: { getChildMeshes(): Array<MaybeMesh> };
  } | null;
  if (!g) return;

  const hover = color.scale(1.4);
  const mainMat = g.coloredMaterial ?? g._coloredMaterial;
  if (mainMat) paintMaterial(mainMat, color);
  const hoverMat = g.hoverMaterial ?? g._hoverMaterial;
  if (hoverMat) paintMaterial(hoverMat, hover);

  // Line and curve meshes inside the gizmo ignore their material color and
  // use AbstractMesh.color. Set that on every child mesh too.
  const root = g._rootMesh;
  if (root && typeof root.getChildMeshes === 'function') {
    for (const m of root.getChildMeshes()) {
      if (!m) continue;
      if ('color' in m) {
        (m as { color: Color3 }).color = color;
      }
      const mat = m.material as MaybeMat;
      if (mat) paintMaterial(mat, color);
    }
  }
}

function paintMaterial(mat: NonNullable<MaybeMat>, color: Color3): void {
  // Render gizmo handles unlit so the color reads saturated, matching the
  // origin axis lines (which are pure Color3 line meshes with no lighting).
  if ('diffuseColor' in mat) mat.diffuseColor = Color3.Black();
  if ('emissiveColor' in mat) mat.emissiveColor = color;
  const lit = mat as { disableLighting?: boolean; specularColor?: Color3 };
  lit.disableLighting = true;
  if (lit.specularColor) lit.specularColor = Color3.Black();
}

// Babylon ArcRotateCamera angle conventions (Y-up):
// position = target + r * (sin(beta)*cos(alpha), cos(beta), sin(beta)*sin(alpha))
// beta = 0  -> camera above target (looking down)
// beta = pi -> camera below target (looking up)
const EPS = 0.0001;
const VIEW_ANGLES: Record<
  Exclude<CameraView, 'perspective'>,
  { alpha: number; beta: number }
> = {
  top: { alpha: -Math.PI / 2, beta: EPS },
  bottom: { alpha: -Math.PI / 2, beta: Math.PI - EPS },
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2 },
  back: { alpha: Math.PI / 2, beta: Math.PI / 2 },
  right: { alpha: 0, beta: Math.PI / 2 },
  left: { alpha: Math.PI, beta: Math.PI / 2 }
};

function applyCameraView(camera: ArcRotateCamera, view: CameraView): void {
  if (view === 'perspective') {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.alpha = Math.PI / 4;
    camera.beta = Math.PI / 3;
    return;
  }
  const a = VIEW_ANGLES[view];
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.alpha = a.alpha;
  camera.beta = a.beta;
}
