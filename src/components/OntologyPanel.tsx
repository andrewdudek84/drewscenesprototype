import { useMemo, useRef, useState } from 'react';
import InlineNameEdit from './InlineNameEdit';
import { PRIM_DRAG_MIME } from '../shapes';
import type { OntologyNode, SpatialBinding } from '../ontology';

export const ENTITY_INSTANCE_DRAG_MIME = 'application/x-entity-instance-id';

/** Strip USD-type descendants from the tree. The parent row stands in for
 *  them in the Ontology panel; their data is surfaced via the merged
 *  Properties form (instance + USD section). */
function filterUsdChildren(nodes: OntologyNode[]): OntologyNode[] {
  return nodes
    .filter((n) => n.entity.type !== 'USD')
    .map((n) => ({ entity: n.entity, children: filterUsdChildren(n.children) }));
}

interface Props {
  /** Pre-built ontology tree (loaded once by `App`). */
  roots: OntologyNode[];
  /** Per-entity bindings produced by drag-drop of Asset prims; owned by App. */
  bindings: Record<string, SpatialBinding>;
  /** Currently selected ontology entity id (derived from selectedId in App
   *  via the prim<->entity binding map). Used to highlight the bound
   *  USD node when the user picks the asset in the viewport/hierarchy. */
  selectedEntityId: string | null;
  onBind: (entityId: string, binding: SpatialBinding) => void;
  /** Fires when the user clicks a bound USD row, so App can flip
   *  selection over to the bound prim (driving viewport gizmo + properties). */
  onSelectEntity: (entityId: string) => void;
  /** Returns asset binding info if the dragged prim is (or descends from) an
   *  Asset-kind group spawned from the library; otherwise null. */
  resolvePrimAsAsset: (primId: string) => {
    guid: string;
    usdaUrl: string;
    name: string;
  } | null;
  /** Top-level "add a new instance under no parent" action. Called with the
   *  page coords of the click so App can anchor a type-picker menu. */
  onAddInstance: (x: number, y: number) => void;
  /** Open the per-entity right-click menu. Pass `null` for clicks on the
   *  panel background / root row. */
  onContextMenu: (entityId: string | null, x: number, y: number) => void;
  /** Id of the entity currently being inline-renamed, or null. */
  editingId: string | null;
  onCommitRename: (entityId: string, newName: string) => void;
  onCancelRename: () => void;
  /** Drag-drop reparent. Pass `null` as `newParentId` to detach to root. The
   *  underlying mutation rewrites HasChild / HasUSD edges so the runtime
   *  tree updates immediately. */
  onReparent: (entityId: string, newParentId: string | null) => void;
  /** Returns whether a reparent of `entityId` onto `newParentId` (null = root)
   *  is allowed by the model. Invalid drops are refused and shake the row to
   *  signal "no" instead of silently mutating the tree. */
  canReparent: (entityId: string, newParentId: string | null) => boolean;
}

export default function OntologyPanel({
  roots,
  bindings,
  selectedEntityId,
  onBind,
  onSelectEntity,
  resolvePrimAsAsset,
  onAddInstance,
  onContextMenu,
  editingId,
  onCommitRename,
  onCancelRename,
  onReparent,
  canReparent
}: Props) {
  const dragRef = useRef<InstanceDragInfo | null>(null);
  const [rootDropOver, setRootDropOver] = useState(false);
  const [rootShake, setRootShake] = useState(false);

  // Visible tree: hide USD-type children. The parent row absorbs them in UX
  // (its Properties panel shows the merged USD section). The underlying
  // ontology schema is unchanged — `descendantsById` below still walks the
  // full tree so reparent drag-drop respects every node.
  const visibleRoots = useMemo(() => filterUsdChildren(roots), [roots]);

  // Lookup: id -> set of descendant ids (inclusive). Used to refuse a drop
  // onto self or any descendant when reparenting via drag-drop.
  const descendantsById = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const walk = (node: OntologyNode, ancestorChain: OntologyNode[]) => {
      for (const a of ancestorChain) {
        let set = map.get(a.entity.id);
        if (!set) {
          set = new Set<string>();
          map.set(a.entity.id, set);
        }
        set.add(node.entity.id);
      }
      let self = map.get(node.entity.id);
      if (!self) {
        self = new Set<string>();
        map.set(node.entity.id, self);
      }
      self.add(node.entity.id);
      for (const c of node.children) walk(c, [...ancestorChain, node]);
    };
    for (const r of roots) walk(r, []);
    return map;
  }, [roots]);

  const onBgContextMenu = (ev: React.MouseEvent) => {
    if (ev.target !== ev.currentTarget) return;
    ev.preventDefault();
    onContextMenu(null, ev.clientX, ev.clientY);
  };

  const onRootDragOver = (ev: React.DragEvent) => {
    if (!ev.dataTransfer.types.includes(ENTITY_INSTANCE_DRAG_MIME)) return;
    ev.preventDefault();
    const draggedId = dragRef.current?.id;
    if (draggedId && !canReparent(draggedId, null)) {
      ev.dataTransfer.dropEffect = 'none';
      setRootDropOver(false);
      return;
    }
    ev.dataTransfer.dropEffect = 'move';
    setRootDropOver(true);
  };
  const onRootDragLeave = () => setRootDropOver(false);
  const onRootDrop = (ev: React.DragEvent) => {
    setRootDropOver(false);
    const id = ev.dataTransfer.getData(ENTITY_INSTANCE_DRAG_MIME);
    if (!id) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!canReparent(id, null)) {
      setRootShake(true);
      dragRef.current = null;
      return;
    }
    onReparent(id, null);
    dragRef.current = null;
  };

  return (
    <aside className="panel ontology">
      <header className="panel-header panel-header-with-actions">
        <span>Entity Instances</span>
        <button
          type="button"
          className="panel-header-btn"
          title="Add instance"
          aria-label="Add entity instance"
          onClick={(ev) => {
            const rect = ev.currentTarget.getBoundingClientRect();
            onAddInstance(rect.left, rect.bottom);
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M8 3 V13 M3 8 H13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      <div className="panel-body" onContextMenu={onBgContextMenu}>
        <ul
          className={
            'tree' +
            (rootDropOver ? ' is-drop-target' : '') +
            (rootShake ? ' is-shake-no' : '')
          }
          onContextMenu={onBgContextMenu}
          onDragOver={onRootDragOver}
          onDragLeave={onRootDragLeave}
          onDrop={onRootDrop}
          onAnimationEnd={() => {
            if (rootShake) setRootShake(false);
          }}
        >
          {visibleRoots.length === 0 ? (
            <li className="tree-empty">No ontology instances.</li>
          ) : (
            visibleRoots.map((n) => (
              <OntologyTreeNode
                key={n.entity.id}
                node={n}
                bindings={bindings}
                selectedEntityId={selectedEntityId}
                resolvePrimAsAsset={resolvePrimAsAsset}
                onBind={onBind}
                onSelectEntity={onSelectEntity}
                onContextMenu={onContextMenu}
                editingId={editingId}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onReparent={onReparent}
                canReparent={canReparent}
                dragRef={dragRef}
                descendantsById={descendantsById}
              />
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}

interface InstanceDragInfo {
  id: string;
  descendants: Set<string>;
}

interface NodeProps {
  node: OntologyNode;
  bindings: Record<string, SpatialBinding>;
  selectedEntityId: string | null;
  resolvePrimAsAsset: Props['resolvePrimAsAsset'];
  onBind: (entityId: string, binding: SpatialBinding) => void;
  onSelectEntity: (entityId: string) => void;
  onContextMenu: (entityId: string | null, x: number, y: number) => void;
  editingId: string | null;
  onCommitRename: (entityId: string, newName: string) => void;
  onCancelRename: () => void;
  onReparent: (entityId: string, newParentId: string | null) => void;
  canReparent: (entityId: string, newParentId: string | null) => boolean;
  dragRef: React.MutableRefObject<InstanceDragInfo | null>;
  descendantsById: Map<string, Set<string>>;
}

function OntologyTreeNode({
  node,
  bindings,
  selectedEntityId,
  resolvePrimAsAsset,
  onBind,
  onSelectEntity,
  onContextMenu,
  editingId,
  onCommitRename,
  onCancelRename,
  onReparent,
  canReparent,
  dragRef,
  descendantsById
}: NodeProps) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [shake, setShake] = useState(false);
  const isSpatial = node.entity.type === 'USD';
  const isSelected = selectedEntityId === node.entity.id;
  const isEditing = editingId === node.entity.id;
  // All instance rows are clickable: clicking routes through App, which
  // shows the entity's properties form and (for bound USD rows) also
  // focuses the bound prim in the viewport.
  const canSelect = true;
  const onClick = (ev: React.MouseEvent) => {
    if (!canSelect) return;
    ev.stopPropagation();
    onSelectEntity(node.entity.id);
  };

  const onInstanceDragStart = (ev: React.DragEvent) => {
    ev.stopPropagation();
    ev.dataTransfer.setData(ENTITY_INSTANCE_DRAG_MIME, node.entity.id);
    ev.dataTransfer.effectAllowed = 'move';
    dragRef.current = {
      id: node.entity.id,
      descendants:
        descendantsById.get(node.entity.id) ?? new Set([node.entity.id])
    };
  };
  const onInstanceDragEnd = () => {
    dragRef.current = null;
  };

  // Row accepts two unrelated drag sources: USD binding (prim drop
  // from Viewport/Hierarchy) and instance reparenting (drag from this panel).
  const onDragOver = (ev: React.DragEvent) => {
    const types = ev.dataTransfer.types;
    if (isSpatial && types.includes(PRIM_DRAG_MIME)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = 'link';
      setDragOver(true);
      return;
    }
    if (types.includes(ENTITY_INSTANCE_DRAG_MIME)) {
      const drag = dragRef.current;
      if (drag && drag.descendants.has(node.entity.id)) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Refuse drops the model wouldn't allow (no matching HasChild edge
      // between parent and child types). We still preventDefault so onDrop
      // fires and we can shake the row — silently swallowing the drop here
      // would leave the user with no feedback.
      if (drag && !canReparent(drag.id, node.entity.id)) {
        ev.dataTransfer.dropEffect = 'none';
        setDragOver(false);
        return;
      }
      ev.dataTransfer.dropEffect = 'move';
      setDragOver(true);
    }
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (ev: React.DragEvent) => {
    setDragOver(false);
    const types = ev.dataTransfer.types;
    if (isSpatial && types.includes(PRIM_DRAG_MIME)) {
      const primId = ev.dataTransfer.getData(PRIM_DRAG_MIME);
      if (!primId) return;
      ev.preventDefault();
      ev.stopPropagation();
      const resolved = resolvePrimAsAsset(primId);
      if (!resolved) return;
      onBind(node.entity.id, {
        usd: resolved.usdaUrl,
        guid: resolved.guid,
        name: resolved.name
      });
      return;
    }
    if (types.includes(ENTITY_INSTANCE_DRAG_MIME)) {
      const id = ev.dataTransfer.getData(ENTITY_INSTANCE_DRAG_MIME);
      if (!id || id === node.entity.id) return;
      const drag = dragRef.current;
      if (drag && drag.descendants.has(node.entity.id)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!canReparent(id, node.entity.id)) {
        setShake(true);
        dragRef.current = null;
        return;
      }
      onReparent(id, node.entity.id);
      dragRef.current = null;
    }
  };

  return (
    <li>
      <div
        className={
          'tree-node' +
          (dragOver ? ' is-drop-target' : '') +
          (isSelected ? ' is-selected' : '') +
          (canSelect ? '' : ' is-non-selectable') +
          (shake ? ' is-shake-no' : '')
        }
        title={`${node.entity.type} · ${node.entity.id}`}
        draggable={!isEditing}
        onDragStart={onInstanceDragStart}
        onDragEnd={onInstanceDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        onAnimationEnd={() => {
          if (shake) setShake(false);
        }}
        onContextMenu={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onContextMenu(node.entity.id, ev.clientX, ev.clientY);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`tree-toggle${expanded ? ' is-expanded' : ''}`}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            ▶
          </button>
        ) : (
          <span className="tree-toggle tree-toggle-placeholder" />
        )}
        {isSpatial && (
          <span className="tree-kind-wrap">
            <span className="tree-kind kind-group" aria-hidden="true" />
          </span>
        )}
        <span className="tree-label">
          {editingId === node.entity.id ? (
            <InlineNameEdit
              initialName={node.entity.name}
              onCommit={(name) => onCommitRename(node.entity.id, name)}
              onCancel={onCancelRename}
            />
          ) : (
            <span>{node.entity.name}</span>
          )}
          <span className="ontology-type">{node.entity.type}</span>
        </span>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((c) => (
            <OntologyTreeNode
              key={c.entity.id}
              node={c}
              bindings={bindings}
              selectedEntityId={selectedEntityId}
              resolvePrimAsAsset={resolvePrimAsAsset}
              onBind={onBind}
              onSelectEntity={onSelectEntity}
              onContextMenu={onContextMenu}
              editingId={editingId}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onReparent={onReparent}
              canReparent={canReparent}
              dragRef={dragRef}
              descendantsById={descendantsById}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
