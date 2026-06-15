import { useMemo, useState } from 'react';
import type { PrimNode, ShapeKind } from '../types';
import { PRIM_DRAG_MIME, SHAPE_DRAG_MIME } from '../shapes';

interface Props {
  prims: PrimNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReparent: (sourceId: string, parentId: string | null) => void;
  onShapeAdd: (kind: ShapeKind, parentId: string | null) => void;
  onDelete: (id: string) => void;
}

export default function HierarchyPanel({
  prims,
  selectedId,
  onSelect,
  onReparent,
  onShapeAdd,
  onDelete
}: Props) {
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, PrimNode[]>();
    for (const p of prims) {
      const list = m.get(p.parentId) ?? [];
      list.push(p);
      m.set(p.parentId, list);
    }
    return m;
  }, [prims]);

  const roots = childrenByParent.get(null) ?? [];

  const [rootDragOver, setRootDragOver] = useState(false);

  const dragKind = (ev: React.DragEvent): 'prim' | 'shape' | null => {
    const types = ev.dataTransfer.types;
    if (types.includes(PRIM_DRAG_MIME)) return 'prim';
    if (types.includes(SHAPE_DRAG_MIME)) return 'shape';
    return null;
  };

  const onRootDragOver = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    if (!kind) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = kind === 'shape' ? 'copy' : 'move';
    setRootDragOver(true);
  };
  const onRootDragLeave = () => setRootDragOver(false);
  const onRootDrop = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    setRootDragOver(false);
    if (!kind) return;
    ev.preventDefault();
    if (kind === 'shape') {
      const shape = ev.dataTransfer.getData(SHAPE_DRAG_MIME) as ShapeKind;
      if (shape) onShapeAdd(shape, null);
    } else {
      const id = ev.dataTransfer.getData(PRIM_DRAG_MIME);
      if (id) onReparent(id, null);
    }
  };

  return (
    <aside className="panel hierarchy">
      <header className="panel-header">Hierarchy</header>
      <div
        className="panel-body"
        onClick={() => onSelect(null)}
        onDragOver={onRootDragOver}
        onDragLeave={onRootDragLeave}
        onDrop={onRootDrop}
      >
        <ul className="tree">
          <li className={`tree-root${rootDragOver ? ' is-drop-target' : ''}`}>
            <span className="tree-label tree-scene">Scene</span>
            {roots.length === 0 ? (
              <div className="tree-empty">
                No prims yet. Drag a shape into the viewport.
              </div>
            ) : (
              <ul>
                {roots.map((p) => (
                  <TreeNode
                    key={p.id}
                    prim={p}
                    childrenByParent={childrenByParent}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onReparent={onReparent}
                    onShapeAdd={onShapeAdd}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </li>
        </ul>
      </div>
    </aside>
  );
}

interface NodeProps {
  prim: PrimNode;
  childrenByParent: Map<string | null, PrimNode[]>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReparent: (sourceId: string, parentId: string | null) => void;
  onShapeAdd: (kind: ShapeKind, parentId: string | null) => void;
  onDelete: (id: string) => void;
}

function TreeNode({
  prim,
  childrenByParent,
  selectedId,
  onSelect,
  onReparent,
  onShapeAdd,
  onDelete
}: NodeProps) {
  const kids = childrenByParent.get(prim.id) ?? [];
  const [dragOver, setDragOver] = useState(false);

  const dragKind = (ev: React.DragEvent): 'prim' | 'shape' | null => {
    const types = ev.dataTransfer.types;
    if (types.includes(PRIM_DRAG_MIME)) return 'prim';
    if (types.includes(SHAPE_DRAG_MIME)) return 'shape';
    return null;
  };

  const onDragStart = (ev: React.DragEvent) => {
    ev.dataTransfer.setData(PRIM_DRAG_MIME, prim.id);
    ev.dataTransfer.setData('text/plain', prim.name);
    ev.dataTransfer.effectAllowed = 'move';
    ev.stopPropagation();
  };
  const onDragOver = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    if (!kind) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = kind === 'shape' ? 'copy' : 'move';
    ev.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (ev: React.DragEvent) => {
    const kind = dragKind(ev);
    setDragOver(false);
    if (!kind) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (kind === 'shape') {
      const shape = ev.dataTransfer.getData(SHAPE_DRAG_MIME) as ShapeKind;
      if (shape) onShapeAdd(shape, prim.id);
      return;
    }
    const id = ev.dataTransfer.getData(PRIM_DRAG_MIME);
    if (!id || id === prim.id) return;
    onReparent(id, prim.id);
  };
  const onClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    onSelect(prim.id);
  };

  const isSelected = selectedId === prim.id;

  return (
    <li>
      <div
        className={
          'tree-node' +
          (isSelected ? ' is-selected' : '') +
          (dragOver ? ' is-drop-target' : '')
        }
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
      >
        <span className={`tree-kind kind-${prim.kind}`} aria-hidden="true" />
        <span className="tree-label">{prim.name}</span>
        <button
          type="button"
          className="tree-delete"
          title={`Delete ${prim.name}`}
          aria-label={`Delete ${prim.name}`}
          draggable={false}
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete(prim.id);
          }}
          onMouseDown={(ev) => ev.stopPropagation()}
        >
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 4 L13 4" />
            <path d="M6.5 4 V2.5 H9.5 V4" />
            <path d="M4.5 4 L5 13.5 H11 L11.5 4" />
            <path d="M6.5 6.5 V11.5 M9.5 6.5 V11.5" />
          </svg>
        </button>
      </div>
      {kids.length > 0 && (
        <ul>
          {kids.map((c) => (
            <TreeNode
              key={c.id}
              prim={c}
              childrenByParent={childrenByParent}
              selectedId={selectedId}
              onSelect={onSelect}
              onReparent={onReparent}
              onShapeAdd={onShapeAdd}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
