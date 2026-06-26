import { useEffect, useMemo, useRef, useState } from 'react';
import InlineNameEdit from './InlineNameEdit';
import {
  PRIM_DRAG_MIME,
  ASSET_DRAG_MIME,
  encodeDragIds,
  decodeDragIds
} from '../shapes';
import { ASSET_LIBRARY } from '../assets';
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

/** Filter the instance tree to entities whose name or type matches `q`
 *  (case-insensitive substring) OR have a descendant that matches.
 *  Non-matching branches are pruned; matching ancestors are kept so the
 *  hierarchy path stays coherent. */
function filterInstancesByQuery(
  nodes: OntologyNode[],
  q: string
): OntologyNode[] {
  if (!q) return nodes;
  const needle = q.toLowerCase();
  const out: OntologyNode[] = [];
  for (const n of nodes) {
    const selfMatch =
      n.entity.name.toLowerCase().includes(needle) ||
      n.entity.type.toLowerCase().includes(needle);
    const filteredChildren = filterInstancesByQuery(n.children, q);
    if (selfMatch || filteredChildren.length > 0) {
      out.push({ entity: n.entity, children: filteredChildren });
    }
  }
  return out;
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
  /** Full multi-selection set of entity ids (always includes
   *  `selectedEntityId` when set). Secondary entries get the lighter
   *  `is-multi-selected` highlight so the user can see what Ctrl+click
   *  added without losing track of the gizmo's primary target. */
  selectedEntityIds: string[];
  onBind: (entityId: string, binding: SpatialBinding) => void;
  /** Fires when a USDA asset (from the palette) or a scene prim is dropped
   *  onto a non-USD instance row. Creates a USD entity holding `usdPath`
   *  and a HasUSD edge from the instance to it. If the instance already has
   *  an outgoing HasUSD edge, the existing target USD entity is updated in
   *  place (path swap) instead. */
  onAttachUsd: (
    instanceId: string,
    usdPath: string,
    suggestedName?: string
  ) => void;
  /** Fires when a scene prim is dropped onto a non-USD instance row.
   *  Unlike `onAttachUsd` (which spawns a fresh prim from a USDA path),
   *  this rebinds the instance's USD child to the *actual* dragged prim
   *  and deletes whatever prim was previously bound. */
  onRebindUsdPrim: (instanceId: string, sourcePrimId: string) => void;
  /** Fires when the user clicks a bound USD row, so App can flip
   *  selection over to the bound prim (driving viewport gizmo + properties).
   *  `additive` (Ctrl/Cmd+click) toggles the row into the multi-selection
   *  instead of replacing it. */
  onSelectEntity: (entityId: string, additive?: boolean) => void;
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
  /** When true the panel hides authoring affordances: the "+" header
   *  button, right-click context menus, inline rename, and drag-drop
   *  reparenting / binding / USD attach. Click-to-select and
   *  expand/collapse remain interactive. */
  readOnly?: boolean;
}

export default function OntologyPanel({
  roots,
  bindings,
  selectedEntityId,
  selectedEntityIds,
  onBind,
  onAttachUsd,
  onRebindUsdPrim,
  onSelectEntity,
  resolvePrimAsAsset,
  onAddInstance,
  onContextMenu,
  editingId,
  onCommitRename,
  onCancelRename,
  onReparent,
  canReparent,
  readOnly = false
}: Props) {
  const dragRef = useRef<InstanceDragInfo | null>(null);
  const [rootDropOver, setRootDropOver] = useState(false);
  const [rootShake, setRootShake] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  // Visible tree: hide USD-type children. The parent row absorbs them in UX
  // (its Properties panel shows the merged USD section). The underlying
  // ontology schema is unchanged — `descendantsById` below still walks the
  // full tree so reparent drag-drop respects every node.
  const visibleRoots = useMemo(() => {
    const hidden = filterUsdChildren(roots);
    return isSearching ? filterInstancesByQuery(hidden, trimmedQuery) : hidden;
  }, [roots, isSearching, trimmedQuery]);

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
    if (readOnly) return;
    if (ev.target !== ev.currentTarget) return;
    ev.preventDefault();
    onContextMenu(null, ev.clientX, ev.clientY);
  };

  const onRootDragOver = (ev: React.DragEvent) => {
    if (readOnly) return;
    if (!ev.dataTransfer.types.includes(ENTITY_INSTANCE_DRAG_MIME)) return;
    ev.preventDefault();
    const drag = dragRef.current;
    // Allow the drop if ANY dragged entity can move to root; the drop
    // handler filters out the rest. If none can, refuse with dropEffect=none.
    if (drag && !drag.ids.some((id) => canReparent(id, null))) {
      ev.dataTransfer.dropEffect = 'none';
      setRootDropOver(false);
      return;
    }
    ev.dataTransfer.dropEffect = 'move';
    setRootDropOver(true);
  };
  const onRootDragLeave = () => setRootDropOver(false);
  const onRootDrop = (ev: React.DragEvent) => {
    if (readOnly) return;
    setRootDropOver(false);
    const raw = ev.dataTransfer.getData(ENTITY_INSTANCE_DRAG_MIME);
    const ids = decodeDragIds(raw);
    if (ids.length === 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const allowed = ids.filter((id) => canReparent(id, null));
    if (allowed.length === 0) {
      setRootShake(true);
      dragRef.current = null;
      return;
    }
    // Each setOntologyDoc updater chains through the React 18 batch so all
    // moves land in one render + one undo entry.
    for (const id of allowed) onReparent(id, null);
    dragRef.current = null;
  };

  return (
    <aside className="panel ontology">
      <header className="panel-header panel-header-with-actions">
        <span>Entity Instances</span>
        {!readOnly && (
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
        )}
      </header>
      <div className="panel-body" onContextMenu={onBgContextMenu}>
        <div className="panel-search">
          <input
            type="search"
            className="panel-search-input"
            placeholder="Search instances…"
            value={searchQuery}
            onChange={(ev) => setSearchQuery(ev.target.value)}
            aria-label="Search entity instances"
          />
          {searchQuery && (
            <button
              type="button"
              className="panel-search-clear"
              title="Clear search"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>
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
            <li className="tree-empty">
              {isSearching ? 'No matching instances.' : 'No ontology instances.'}
            </li>
          ) : (
            visibleRoots.map((n) => (
              <OntologyTreeNode
                key={n.entity.id}
                node={n}
                bindings={bindings}
                selectedEntityId={selectedEntityId}
                selectedEntityIds={selectedEntityIds}
                resolvePrimAsAsset={resolvePrimAsAsset}
                onBind={onBind}
                onAttachUsd={onAttachUsd}
                onRebindUsdPrim={onRebindUsdPrim}
                onSelectEntity={onSelectEntity}
                onContextMenu={onContextMenu}
                editingId={editingId}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onReparent={onReparent}
                canReparent={canReparent}
                dragRef={dragRef}
                descendantsById={descendantsById}
                depth={0}
                forceExpand={isSearching}
                readOnly={readOnly}
              />
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}

interface InstanceDragInfo {
  // All ids being dragged in this gesture (multi-select aware). Single-drag
  // is just a length-1 array.
  ids: string[];
  // Union of every dragged id's descendant set (inclusive). Used to refuse
  // a drop onto self or any descendant of any dragged item.
  descendants: Set<string>;
}

interface NodeProps {
  node: OntologyNode;
  bindings: Record<string, SpatialBinding>;
  selectedEntityId: string | null;
  selectedEntityIds: string[];
  resolvePrimAsAsset: Props['resolvePrimAsAsset'];
  onBind: (entityId: string, binding: SpatialBinding) => void;
  onAttachUsd: Props['onAttachUsd'];
  onRebindUsdPrim: Props['onRebindUsdPrim'];
  onSelectEntity: (entityId: string, additive?: boolean) => void;
  onContextMenu: (entityId: string | null, x: number, y: number) => void;
  editingId: string | null;
  onCommitRename: (entityId: string, newName: string) => void;
  onCancelRename: () => void;
  onReparent: (entityId: string, newParentId: string | null) => void;
  canReparent: (entityId: string, newParentId: string | null) => boolean;
  dragRef: React.MutableRefObject<InstanceDragInfo | null>;
  descendantsById: Map<string, Set<string>>;
  /** Depth in the tree. Root rows are 0; their children 1, etc. Used to
   * default-expand only the root rows so duplicates and deep trees don't
   * blow open on first render. */
  depth: number;
  /** When true, the node renders expanded regardless of local toggle state.
   *  Used while a search query is active so matches deep in the tree are
   *  visible without the user expanding every ancestor manually. */
  forceExpand?: boolean;
  /** Authoring affordances (drag-drop reparent, binding, USD attach,
   *  right-click menu, inline rename) are suppressed when true. */
  readOnly?: boolean;
}

function OntologyTreeNode({
  node,
  bindings,
  selectedEntityId,
  selectedEntityIds,
  resolvePrimAsAsset,
  onBind,
  onAttachUsd,
  onRebindUsdPrim,
  onSelectEntity,
  onContextMenu,
  editingId,
  onCommitRename,
  onCancelRename,
  onReparent,
  canReparent,
  dragRef,
  descendantsById,
  depth,
  forceExpand = false,
  readOnly = false
}: NodeProps) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(depth === 0);
  const effectiveExpanded = forceExpand || expanded;
  const [dragOver, setDragOver] = useState(false);
  const [shake, setShake] = useState(false);
  const isSpatial = node.entity.type === 'USD';
  const isSelected = selectedEntityId === node.entity.id;
  const isInMultiSelection =
    !isSelected && selectedEntityIds.includes(node.entity.id);
  const isEditing = editingId === node.entity.id;
  // Auto-expand whenever the selection (single or multi) lands on any of
  // this node's descendants, so newly-created children and viewport picks
  // are revealed even if their parent was collapsed.
  const descendantSet = descendantsById.get(node.entity.id);
  const containsSelection =
    hasChildren &&
    !!descendantSet &&
    ((selectedEntityId !== null &&
      selectedEntityId !== node.entity.id &&
      descendantSet.has(selectedEntityId)) ||
      selectedEntityIds.some(
        (id) => id !== node.entity.id && descendantSet.has(id)
      ));
  useEffect(() => {
    if (containsSelection) setExpanded(true);
  }, [containsSelection]);
  // Scroll the selected row into view so picks made elsewhere (viewport,
  // Hierarchy, Properties round-trips) reveal the matching ontology row.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [isSelected]);
  // All instance rows are clickable: clicking routes through App, which
  // shows the entity's properties form and (for bound USD rows) also
  // focuses the bound prim in the viewport.
  const canSelect = true;
  const onClick = (ev: React.MouseEvent) => {
    if (!canSelect) return;
    ev.stopPropagation();
    onSelectEntity(node.entity.id, ev.ctrlKey || ev.metaKey);
  };

  const onInstanceDragStart = (ev: React.DragEvent) => {
    if (readOnly) return;
    ev.stopPropagation();
    // If this row is part of the current multi-selection, drag the whole
    // set so a single drop reparents every selected instance. Otherwise
    // drag just this row.
    const draggedIds =
      selectedEntityIds.includes(node.entity.id) &&
      selectedEntityIds.length > 1
        ? selectedEntityIds
        : [node.entity.id];
    ev.dataTransfer.setData(
      ENTITY_INSTANCE_DRAG_MIME,
      encodeDragIds(draggedIds)
    );
    ev.dataTransfer.effectAllowed = 'move';
    // Union of every dragged id's descendants (each set is inclusive of the
    // id itself) so onDragOver / onDrop can refuse drops onto self-or-descendant
    // of ANY dragged item.
    const descendants = new Set<string>();
    for (const id of draggedIds) {
      const d = descendantsById.get(id);
      if (d) for (const x of d) descendants.add(x);
      else descendants.add(id);
    }
    dragRef.current = { ids: draggedIds, descendants };
  };
  const onInstanceDragEnd = () => {
    dragRef.current = null;
  };

  // Row accepts three drag sources:
  //  - USD binding (PRIM_DRAG_MIME on a USD-typed row) — sets the runtime
  //    binding map for prim<->SpatialItem.
  //  - USD attach (PRIM_DRAG_MIME or ASSET_DRAG_MIME on a non-USD instance
  //    row) — upserts a HasUSD edge from this instance to a USD entity
  //    holding the dropped asset's USDA path.
  //  - Instance reparenting (ENTITY_INSTANCE_DRAG_MIME).
  const acceptsUsdAttach = !isSpatial;
  const onDragOver = (ev: React.DragEvent) => {
    if (readOnly) return;
    const types = ev.dataTransfer.types;
    if (isSpatial && types.includes(PRIM_DRAG_MIME)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = 'link';
      setDragOver(true);
      return;
    }
    if (
      acceptsUsdAttach &&
      (types.includes(ASSET_DRAG_MIME) || types.includes(PRIM_DRAG_MIME))
    ) {
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
      // Refuse drops the model wouldn't allow: only show the move cursor
      // when AT LEAST ONE dragged id has a matching HasChild edge to this
      // target type. The drop handler filters out the disallowed ones.
      if (drag && !drag.ids.some((id) => canReparent(id, node.entity.id))) {
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
    if (readOnly) return;
    setDragOver(false);
    const types = ev.dataTransfer.types;
    if (isSpatial && types.includes(PRIM_DRAG_MIME)) {
      const raw = ev.dataTransfer.getData(PRIM_DRAG_MIME);
      // Binding is single-target: an entity binds to one prim. If the user
      // drags a multi-select, bind the primary (first id).
      const primId = decodeDragIds(raw)[0];
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
    if (acceptsUsdAttach && types.includes(ASSET_DRAG_MIME)) {
      const assetId = ev.dataTransfer.getData(ASSET_DRAG_MIME).trim();
      if (!assetId) return;
      ev.preventDefault();
      ev.stopPropagation();
      const asset = ASSET_LIBRARY.find((a) => a.id === assetId);
      const usdPath = `/usd_assets/${assetId}.usda`;
      const suggestedName = `${node.entity.name} ${asset?.label ?? assetId}`;
      onAttachUsd(node.entity.id, usdPath, suggestedName);
      return;
    }
    if (acceptsUsdAttach && types.includes(PRIM_DRAG_MIME)) {
      const raw = ev.dataTransfer.getData(PRIM_DRAG_MIME);
      const primId = decodeDragIds(raw)[0];
      if (!primId) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Rebind to the *actual* dragged prim and drop the previously-bound
      // prim, instead of spawning a duplicate from the USDA path.
      onRebindUsdPrim(node.entity.id, primId);
      return;
    }
    if (types.includes(ENTITY_INSTANCE_DRAG_MIME)) {
      const raw = ev.dataTransfer.getData(ENTITY_INSTANCE_DRAG_MIME);
      const ids = decodeDragIds(raw).filter((id) => id && id !== node.entity.id);
      if (ids.length === 0) return;
      const drag = dragRef.current;
      if (drag && drag.descendants.has(node.entity.id)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const allowed = ids.filter((id) => canReparent(id, node.entity.id));
      if (allowed.length === 0) {
        setShake(true);
        dragRef.current = null;
        return;
      }
      for (const id of allowed) onReparent(id, node.entity.id);
      dragRef.current = null;
    }
  };

  return (
    <li>
      <div
        ref={rowRef}
        className={
          'tree-node' +
          (dragOver ? ' is-drop-target' : '') +
          (isSelected ? ' is-selected' : '') +
          (isInMultiSelection ? ' is-multi-selected' : '') +
          (canSelect ? '' : ' is-non-selectable') +
          (shake ? ' is-shake-no' : '')
        }
        title={`${node.entity.type} · ${node.entity.id}`}
        draggable={!isEditing && !readOnly}
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
          if (readOnly) return;
          ev.preventDefault();
          ev.stopPropagation();
          onContextMenu(node.entity.id, ev.clientX, ev.clientY);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`tree-toggle${effectiveExpanded ? ' is-expanded' : ''}`}
            onClick={() => setExpanded((v) => !v)}
            aria-label={effectiveExpanded ? 'Collapse' : 'Expand'}
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
      {hasChildren && effectiveExpanded && (
        <ul>
          {node.children.map((c) => (
            <OntologyTreeNode
              key={c.entity.id}
              node={c}
              bindings={bindings}
              selectedEntityId={selectedEntityId}
              selectedEntityIds={selectedEntityIds}
              resolvePrimAsAsset={resolvePrimAsAsset}
              onBind={onBind}
              onAttachUsd={onAttachUsd}
              onRebindUsdPrim={onRebindUsdPrim}
              onSelectEntity={onSelectEntity}
              onContextMenu={onContextMenu}
              editingId={editingId}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onReparent={onReparent}
              canReparent={canReparent}
              dragRef={dragRef}
              descendantsById={descendantsById}
              depth={depth + 1}
              forceExpand={forceExpand}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
